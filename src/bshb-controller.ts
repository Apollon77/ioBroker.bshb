import {BoschSmartHomeBridge, BoschSmartHomeBridgeBuilder} from 'bosch-smart-home-bridge';
import {Bshb} from './main';
import {BshbLogger} from './bshb-logger';
import {BehaviorSubject, concat, EMPTY, merge, Observable, of, Subject, timer} from 'rxjs';
import {catchError, delay, delayWhen, repeat, retryWhen, switchMap, takeUntil, tap} from "rxjs/operators";
import {Utils} from "./utils";
import {BshbHandler} from "./controller/handler/bshb-handler";
import {BshbScenarioHandler} from "./controller/handler/bshb-scenario-handler";
import {BshbDeviceHandler} from "./controller/handler/bshb-device-handler";
import {BshbMessagesHandler} from "./controller/handler/bshb-messages-handler";
import {BshbOpenDoorWindowHandler} from "./controller/handler/bshb-open-door-window-handler";
import {BshbIntrusionDetection} from "./controller/handler/bshb-intrusion-detection";

/**
 * This controller encapsulates bosch-smart-home-bridge and provides it to iobroker.bshb
 *
 * @author Christopher Holomek
 * @since 27.09.2019
 */
export class BshbController {

    private readonly boschSmartHomeBridge: BoschSmartHomeBridge;
    private clientName = 'ioBroker.bshb';

    private handlers: BshbHandler[];

    /**
     * Create a new instance of {@link BshbController}
     *
     * @param bshb
     *        instance of {@link Bshb}
     * @param clientCert
     *        client certificate
     * @param clientPrivateKey
     *        client private key
     */
    constructor(private bshb: Bshb, clientCert: string, clientPrivateKey: string) {
        try {
            this.boschSmartHomeBridge = BoschSmartHomeBridgeBuilder.builder()
                .withHost(bshb.config.host)
                .withClientCert(clientCert)
                .withClientPrivateKey(clientPrivateKey)
                .withLogger(new BshbLogger(bshb))
                .build();

            this.handlers = [];
            this.handlers.push(new BshbScenarioHandler(this.bshb, this.boschSmartHomeBridge));
            this.handlers.push(new BshbMessagesHandler(this.bshb, this.boschSmartHomeBridge));
            this.handlers.push(new BshbIntrusionDetection(this.bshb, this.boschSmartHomeBridge));
            this.handlers.push(new BshbDeviceHandler(this.bshb, this.boschSmartHomeBridge));
            this.handlers.push(new BshbOpenDoorWindowHandler(this.bshb, this.boschSmartHomeBridge));

        } catch (e) {
            throw Utils.createError(bshb.log, e);
        }
    }

    public getBshcClient() {
        return this.boschSmartHomeBridge.getBshcClient();
    }

    /**
     * Pair devices if needed
     *
     * @param systemPassword
     *        system password of BSHC
     */
    public pairDeviceIfNeeded(systemPassword: string) {

        let pairingDelay = 5000;
        if (this.bshb.config.pairingDelay && this.bshb.config.pairingDelay > 5000) {
            pairingDelay = this.bshb.config.pairingDelay;
        }

        // Retry pairIfNeeded logic. It is a bit more complicated compared to before because pairIfNeeded completes stream after attempts.
        // Community wants that it reconnects all the time. But pairIfNeeded might not be suitable because client may be paired already but
        // connection is broken. Then pairIfNeeded never goes back to test if client is paired and is stuck.
        // Here we retry the pairIfNeeded without attempts configured. So we try once. If something is not ok we wait
        // for pairing delay before we try again. We use takeUntil to make sure that we stop streams if adapter shuts-down
        // takeUntil must be last in pipe to prevent issues.
        return new Observable(subscriber => {
            const retry = new BehaviorSubject<boolean>(true);
            retry.pipe(catchError(err => err.pipe(delay(pairingDelay))), tap(() => {
                this.boschSmartHomeBridge.pairIfNeeded(this.clientName,this.bshb.config.identifier, systemPassword, pairingDelay, -1).pipe(
                    takeUntil(this.bshb.alive)
                ).subscribe(response => {
                    // Everything is ok. We can stop all.
                    subscriber.next(response);
                    subscriber.complete();
                    retry.complete();
                }, () => {
                    // Something went wrong. Already logged by lib. We just wait and retry.
                    timer(pairingDelay).pipe(takeUntil(this.bshb.alive)).subscribe(value => {
                        retry.next(true);
                    });
                })
            }), takeUntil(this.bshb.alive)).subscribe(() => {
                // We do not care
            });
        });
    }

    /**
     * Start overall detection
     *
     * @return observable with no content
     */
    public startDetection(): Observable<void> {
        return concat(this.handlers.map(value => value.handleDetection())).pipe(switchMap(value => value));
    }

    /**
     * Changes on a state which results in a call to bshc controller
     *
     * @param id
     *        id of state which changed
     * @param state
     *        state itself
     */
    public setState(id: string, state: ioBroker.State) {
        for (let i = 0; i < this.handlers.length; i++) {
            let handled = this.handlers[i].sendUpdateToBshc(id, state);
            if (handled) {
                this.bshb.log.silly(`Handler "${this.handlers[i].constructor.name}" send message to controller with state id=${id} and value=${state.val}`);
            }
        }
    }

    /**
     * Changes from bshc controller which results in updates on ioBroker state
     *
     * @param resultEntry
     *        entry of changes which will be mapped to a state
     */
    public setStateAck(resultEntry: any) {
        for (let i = 0; i < this.handlers.length; i++) {
            let handled = this.handlers[i].handleBshcUpdate(resultEntry);
            if (handled) {
                this.bshb.log.silly(`Handler "${this.handlers[i].constructor.name}" handled update form controller with result entry: ${JSON.stringify(resultEntry)} `)
            }
        }
    }
}