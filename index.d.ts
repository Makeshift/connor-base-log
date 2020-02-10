declare module 'connor-base-log' {
    import {Logger} from "winston";

    export function exportLogger(): Logger;
}