/*jslint browser: true, vars: true, white: true, maxerr: 50, indent: 4 */
/*global $ */
"use strict";

$.support.cors = true; // Force cross-site scripting.

var netvibesNotifier = (function (opera)
{
    var button = null;
    var buttonProperties =
    {
        title: "Netvibes Notifier",
        icon: "images/icons/netvibesDisabled_64x64.png",
        badge:
        {
            backgroundColor: "#cf0016", // Monza red.
            color: "#ffffff", // White.
            display: "block",
            textContent: "?"
        }
    };

    var console = window.console;
    var parseBool = window.parseBool;
    var updaterIntervalId = null;

    var options = null;

    var uris =
    {
        api: "http://www.netvibes.com/api",
        home: "http://www.netvibes.com"
    };

    var counters =
    {
        retries:
        {
            current: 0,
            total: 0
        }
    };

    var loadPreferences = function ()
    {
        var preferences = window.widget.preferences;

        var getInt = function (preferenceName, defaultPreference)
        {
            var value = parseInt(preferences.getItem(preferenceName), 10);
            return (!isNaN(value) ? value : defaultPreference);
        };

        var getBool = function (preferenceName, defaultPreference)
        {
            var value = parseBool(preferences.getItem(preferenceName));
            return (typeof value === "boolean" ? value : defaultPreference);
        };

        options =
        {
            updater:
            {
                willRunUpdater: getBool("willRunUpdater", true),
                willRetryContinously: getBool("willRetryContinously", false),
                maximumNumberOfRetries: getInt("maximumNumberOfRetries", 15),
                updateInterval: getInt("updateInterval", 1200000) // 20 minutes.
            }
        };
    };

    var clearCounters = function ()
    {
        counters.retries.current = 0;
    };

    /**
     * List of private and non-branded dashboards.
     */
    var dashboards = [];

    /**
     * List of feed IDs in the selected dashboard.
     */
    var feeds = [];

    /**
     * List of module IDs (= secure feeds in the selected dashboard).
     */
    var modules = [];

    /**
     * Update notification to show an error occurred
     *
     * @return void
     */
    var displayError = function ()
    {
        var numberOfRetries = counters.retries;
        numberOfRetries.current += 1;
        numberOfRetries.total += 1;
        console.log("[" + buttonProperties.title + "] displayError(): (Retry: " + numberOfRetries.current + "; Total: " + numberOfRetries.total + ").");

        var updater = options.updater;
        if (!updater.willRetryContinously && numberOfRetries.current >= updater.maximumNumberOfRetries)
        {
            window.clearInterval(updaterIntervalId);
            window.widget.preferences.setItem("willRunUpdater", false);
            clearCounters();
        }

        button.badge.textContent = "?";
        button.icon = "images/icons/netvibesDisabled_64x64.png";
    };

    /**
     * Update unread count.
     * If this count is equal to 0 (= nothing to read), set the disabled
     * black and white icon. Otherwise, set classic Netvibes icon.
     *
     * @params int unreadCount
     */
    var updateUnreadCount = function (unreadCount)
    {
        unreadCount = parseInt(unreadCount, 10);

        if (isNaN(unreadCount))
        {
            displayError();
            return;
        }

        var badge = button.badge;
        badge.display = (unreadCount === 0 ? "none" : "block");
        badge.textContent = unreadCount;

        button.icon = (unreadCount > 0 ? "images/icons/netvibesEnabled_64x64.png" : "images/icons/netvibesDisabled_64x64.png");
    };

    /**
     * Fetches selected dashboard.
     * If local storage is empty or invalid (ID doesn't exist),
     * select the first dashboard.
     *
     * @return object
     */
    var fetchSelectedDashboard = function ()
    {
        if (dashboards.length === 0)
        {
            return false;
        }

        var preferences = window.widget.preferences;

        var i = 0;
        var dashboardId = preferences.getItem("dashboardId");
        if (!isNaN(parseInt(dashboardId, 10))) // If valid number.
        {
            $.each(dashboards, function (j, dashboard)
            {
                if (dashboard.id === dashboardId)
                {
                    i = j;
                }
            });
        }

        var current = dashboards[i];
        preferences.setItem("dashboardId", current.id);
        return current;
    };

    /**
     * Fetch unread count from list of feed IDs and/or module IDs.
     *
     * @return void
     */
    var fetchUnreadCount = function ()
    {
        if (fetchSelectedDashboard() === false)
        {
            displayError();
        }
        else if (feeds.length === 0 && modules.length === 0)
        {
            updateUnreadCount(0);
        }
        else
        {
            $.getJSON(uris.api + "/feeds/info",
            {
                feeds: feeds.join(","),
                modules: modules.join(",")
            }, function (data)
            {
                var isDuplicate = false;
                $.each(data.feeds, function (i, feed)
                {
                    if (feed.is_duplicate)
                    {
                        var j = feeds.indexOf(feed.id);
                        feeds[j] = feed.is_duplicate;
                        isDuplicate = true;
                    }
                });

                if (isDuplicate)
                {
                    fetchUnreadCount();
                }
                else
                {
                    updateUnreadCount(data.unread_count);
                }
            });
        }
    };

    /**
     * Fetch feeds identified by:
     * - config URL if multiple feeds (miso or PW)
     * - module ID if url contains a login (= secure feed)
     * - ID when it's possible, else url.
     *
     * @return void
     */
    var fetchFeeds = function ()
    {
        var dashboard = fetchSelectedDashboard();
        if (dashboard === false)
        {
            return;
        }

        $.getJSON(uris.api + "/my/widgets/" + dashboard.id, function (data)
        {
            feeds = [];
            modules = [];
            //var urls = [];
            $.each(data.widgets, function (i, widget)
            {
                switch (widget.name)
                {
                    case "RssReader":
                        // If there is a login in the URL, it's a secure feed.
                        // Need the module ID instead of the feed ID.
                        if (widget.data.feedUrl && widget.data.feedUrl.match(/^https?:\/\/\w+@/))
                        {
                            modules.push(widget.id);
                        }
                        else
                        {
                            feeds.push(widget.data.feedId);
                        }
                        break;
                    case "MultipleFeeds":
                        var list = widget.data["list_" + widget.data.category] ? widget.data["list_" + widget.data.category].split(",") : false; // List of selected tabs.
                        $.each(widget.feeds, function (i, feed)
                        {
                            if (!list || list.indexOf(feed.id.toString()) >= 0)
                            {
                                feeds.push(feed.feedId);
                            }
                        });
                        break;
                    /* Doesn't work because need to know the base url of premium dashboard.
                    case "SmartTagged":
                        feeds.push(widget.data.feedId);
                        break;
                    */
                   default:
                       break;
                }
            });

            fetchUnreadCount();
        });
    };

    /**
     * Show the selected Netvibes dashboard.
     * If a tab is already open on Netvibes (welcome page, private dashboard, or sign-in/up), use it.
     * Otherwise, open a new tab.
     *
     * @return void
     */
    var openTab = function ()
    {
        var dashboard = fetchSelectedDashboard();
        var url = (uris.home + (dashboard === false ? "/signin" : "/privatepage/" + dashboard.name));

        var hasFoundTab = false;
//        $.each(opera.extension.windows.getAll(), function (i, browserWindow)
//        {
//            var tabs = browserWindow.tabs;
//            $.each(tabs, function (j, tab)
//            {
//                if (!hasFoundTab && tab.url.match("http://www.netvibes.com/([a-z]{2}$|signin|signup|privatepage/" + (dashboard.name || "") + ")"))
//                {
//                    hasFoundTab = true;
//
//                    var tabProperties =
//                    {
//                        focused: true
//                    };
//
//                    if (!tab.url.match("^" + url))
//                    {
//                        tabProperties.url = url;
//                    }
//
//                    tab.update(tabProperties); // Fails silently. May work in future.
//                }
//            });
//        });

        if (!hasFoundTab)
        {
            opera.extension.tabs.create({url: url, focused: true});
        }
    };

    var publicMembers =
    {
        getTitle: function ()
        {
            return buttonProperties.title;
        },
        getHomeUri: function ()
        {
            return uris.home;
        },
        getDashboards: function ()
        {
            return dashboards;
        },

        /**
         * Fetches list of private dashboards.
         * Skip branded dashboards because we don't know their URLs
         * and because cookies are not set on brand.netvibesbusinnes.com.
         * Filters don't work on www.netvibes.com, so if tagging is enabled,
         * unread counter is wrong!
         *
         * @return void
         */
        fetchDashboards: function (successCallback, errorCallback)
        {
            $.getJSON(uris.api + "/my/dashboards", function (data)
            {
                dashboards = [];
                $.each(data.dashboards, function (id, dashboard)
                {
                    if (dashboard.access !== "public" && (!dashboard.brand || dashboard.brand === "www"))
                    {
                        dashboards.push(
                        {
                            id: id,
                            title: dashboard.title,
                            name: dashboard.name
                        });
                    }
                });
            }).success(function ()
            {
                successCallback();
            }).error(function (eventObject)
            {
                console.log("[" + buttonProperties.title + "] fetchDashboards(): Unexpected readyState " + eventObject.readyState + " and status " + eventObject.status + ".");
                errorCallback();
            });
        },
        fetchSelectedDashboard: function ()
        {
            return fetchSelectedDashboard();
        },

        /**
         * Reset all data.
         *
         * @return void
         */
        reset: function ()
        {
            publicMembers.fetchDashboards(fetchFeeds, displayError);
        },

        /**
         * Refresh data.
         * Only feeds, modules, and unread count. Not dashboards.
         *
         * @return void
         */
        refresh: function ()
        {
            fetchFeeds();
        },
        runUpdater: function ()
        {
            window.clearInterval(updaterIntervalId); // Remove any existing update intervals.
            updaterIntervalId = window.setInterval(function ()
            {
                publicMembers.refresh();
                fetchUnreadCount();
            }, options.updater.updateInterval);
        },
        reloadPreferences: function ()
        {
            loadPreferences();
            clearCounters();

            publicMembers.reset();

            if (options.updater.willRunUpdater)
            {
                publicMembers.runUpdater();
            }
            else
            {
                window.clearInterval(updaterIntervalId);
            }
        },
        initialize: function ()
        {
            /* Add the toolbar button */
            var toolbar = opera.contexts.toolbar;
            button = toolbar.createItem(buttonProperties);
            button.addEventListener("click", function ()
            {
                publicMembers.reset();
                openTab();
            }, false);
            toolbar.addItem(button);

            publicMembers.reloadPreferences();
        }
    };

    return publicMembers;
}(window.opera));

(function ()
{
    window.addEventListener("DOMContentLoaded", function ()
    {
        netvibesNotifier.initialize();
    }, false);
}());