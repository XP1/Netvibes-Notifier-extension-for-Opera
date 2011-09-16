/*jslint browser: true, vars: true, white: true, maxerr: 50, indent: 4 */
"use strict";

var parseBool = function (string)
{
    var result = (void 0); // Return undefined for unparsable arguments. Avoid assignment of writable, global variable "undefined".

    if (typeof string === "string")
    {
        var cleanString = string.trim().toLowerCase();
        if (cleanString === "true")
        {
            result = true;
        }
        else if (cleanString === "false")
        {
            result = false;
        }
    }

    return result;
};