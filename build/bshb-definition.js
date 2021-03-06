"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BshbDefinition = void 0;
/**
 * This class contains definitions for iobroker based on bshb data
 *
 * @author Christopher Holomek
 * @since 27.09.2019
 */
const roles_1 = require("./definition/roles");
const function_1 = require("./definition/function");
const units_1 = require("./definition/units");
const states_1 = require("./definition/states");
class BshbDefinition {
    static determineFunction(value) {
        const func = function_1.FUNCTIONS[value];
        if (func !== null && typeof func !== 'undefined') {
            return func;
        }
        return undefined;
    }
    /**
     * Get type of a value from bsh
     *
     * @param value value to determine type for
     */
    static determineType(value) {
        if (Array.isArray(value)) {
            return 'array';
        }
        return (typeof value);
    }
    /**
     * Get role of bsh device state
     * @param type
     *        '@type' of bsh
     * @param key
     *        key of a device state
     */
    static determineRole(type, key) {
        // faults are always a list. Does not matter which service.
        if (key === 'faults') {
            return 'list';
        }
        const roleType = roles_1.ROLES[type];
        if (roleType !== null && typeof roleType !== 'undefined') {
            const role = roleType[key];
            if (role !== null && typeof role !== 'undefined') {
                return role;
            }
        }
        return 'state';
    }
    static determineUnit(type, key) {
        const unitType = units_1.UNITS[type];
        if (unitType !== null && typeof unitType !== 'undefined') {
            const unit = unitType[key];
            if (unit !== null && typeof unit !== 'undefined') {
                return unit;
            }
        }
        return undefined;
    }
    static determineStates(type, key) {
        const stateType = states_1.STATES[type];
        if (stateType !== null && typeof stateType !== 'undefined') {
            const state = stateType[key];
            if (state !== null && typeof state !== 'undefined') {
                return state;
            }
        }
        return undefined;
    }
}
exports.BshbDefinition = BshbDefinition;
