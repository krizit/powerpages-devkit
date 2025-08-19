console.log("library.js loaded");

// Define the main namespace if it doesn’t already exist
var library = library || {};

// ======================================================================
// Sub-namespace for grid-related functions
// ======================================================================
library.grid = (function () {

    // Public functions (each self-sufficient)
    return {

        /**
         * Observe Power Pages subgrids and show/hide the "Add" button(s)
         * depending on current row count.
         * Self-sufficient: includes its own helpers and CSS injection.
         *
         * @param {Object} opts
         * @param {number} opts.maxRows               - Maximum rows before hiding Add
         * @param {string} [opts.entityName]          - Optional logical name used in <tr data-entity="">
         * @param {string} [opts.gridSelector]        - Selector for subgrids
         * @param {string} [opts.addButtonSelector]   - Selector for Add buttons within a grid
         * @returns {Function} dispose()              - Disconnects observer
         */
        limitSubgridAdds: function (opts) {

            // ---- Local helpers (scoped to this function) ----
            function injectStyleOnce() {
                if (document.getElementById("pp-subgrid-add-toggle")) return;
                var style = document.createElement("style");
                style.id = "pp-subgrid-add-toggle";
                style.textContent =
                    ".entity-grid.subgrid .view-toolbar .create-action{display:none!important;}" +
                    ".entity-grid.subgrid .view-toolbar .create-action.pp-show-add{display:inline-flex!important;}";
                document.head.appendChild(style);
            }

            function countRows(grid, entityName) {
                var table = grid.querySelector(".view-grid table");
                if (!table) return 0;
                var count = 0;
                if (entityName) {
                    count = table.querySelectorAll('tbody tr[data-entity="' + entityName + '"]').length;
                }
                if (count === 0) count = table.querySelectorAll("tbody tr").length;
                return count;
            }

            function showAdd(btn) {
                btn.classList.add("pp-show-add");
                btn.style.removeProperty("display");
                btn.style.removeProperty("visibility");
                btn.removeAttribute("hidden");
                btn.setAttribute("aria-hidden", "false");
                btn.setAttribute("aria-disabled", "false");
                btn.tabIndex = 0;
            }

            function hideAdd(btn) {
                btn.classList.remove("pp-show-add");
                btn.style.removeProperty("display");
                btn.setAttribute("hidden", "true");
                btn.setAttribute("aria-hidden", "true");
                btn.setAttribute("aria-disabled", "true");
                btn.tabIndex = -1;
            }

            // ---- Options + setup ----
            var MAX_ROWS = Number(opts && opts.maxRows) || 3;
            var ENTITY_NAME = (opts && opts.entityName) || "";
            var GRID_SELECTOR = (opts && opts.gridSelector) || ".entity-grid.subgrid";
            var ADD_BUTTON_SELECTOR = (opts && opts.addButtonSelector) || ".view-toolbar .create-action";

            injectStyleOnce();

            function toggleInGrid(grid) {
                var rows = countRows(grid, ENTITY_NAME);
                var buttons = grid.querySelectorAll(ADD_BUTTON_SELECTOR);
                if (rows < MAX_ROWS) Array.from(buttons).forEach(showAdd);
                else Array.from(buttons).forEach(hideAdd);
            }

            function toggleAll() {
                Array.from(document.querySelectorAll(GRID_SELECTOR)).forEach(toggleInGrid);
            }

            // Initial and observe
            toggleAll();
            var obs = new MutationObserver(toggleAll);
            obs.observe(document.body, { childList: true, subtree: true });

            // Disposer
            return function dispose() {
                try { obs.disconnect(); } catch {}
            };
        }

    };

})();

// ======================================================================
// Sub-namespace for form-related functions
// ======================================================================
library.form = (function () {

    // Public functions (each self-sufficient)
    return {

        /**
         * Apply conditional show/hide behavior to fields based on rules.
         * Self-sufficient: includes its own value coercion, container finding,
         * value clearing, and event wiring.
         *
         * Rule shape:
         *  - target: CSS selector for the input/field element
         *  - deps: array of selectors to listen for changes
         *  - when(ctx): boolean (true=show, false=hide)
         *  - clearWhenHidden: boolean (optional) clear value when hiding
         *
         * @param {Array} rules
         * @param {Object} [options]
         * @param {number} [options.containerDepth=3] - Parent hops from target to wrapper
         * @param {boolean} [options.log=false]       - Console-log decisions
         * @returns {Function} reapplyAll()           - Re-evaluates all rules
         */
        setupConditionalFields: function (rules, options) {

            // ---- Local helpers (scoped to this function) ----
            function coerceNumber(v) {
                return (typeof v === "string" && /^-?\d+$/.test(v)) ? parseInt(v, 10) : v;
            }

            function val(el) {
                if (!el) return "";
                var tag = (el.tagName || "").toUpperCase();
                var type = (el.type || "").toLowerCase();

                if (type === "checkbox") return !!el.checked;

                if (type === "radio") {
                    var group = document.querySelectorAll('input[type="radio"][name="' + el.name + '"]');
                    var checked = Array.from(group).find(function (r) { return r.checked; });
                    return coerceNumber(checked ? checked.value : "");
                }

                if (tag === "SELECT" && el.multiple) {
                    return Array.from(el.selectedOptions).map(function (o) { return coerceNumber(o.value); });
                }

                return coerceNumber((el.value || "").trim());
            }

            function fieldWrap(el, depth) {
                var c = el;
                for (var i = 0; i < depth && c && c.parentElement; i++) {
                    c = c.parentElement;
                }
                return c || el;
            }

            function clearValue(el) {
                if (!el) return;
                var tag = (el.tagName || "").toUpperCase();
                var type = (el.type || "").toLowerCase();

                if (type === "checkbox") {
                    el.checked = false;
                } else if (type === "radio") {
                    var group = document.querySelectorAll('input[type="radio"][name="' + el.name + '"]');
                    Array.from(group).forEach(function (r) { r.checked = false; });
                } else if (tag === "SELECT" && el.multiple) {
                    Array.from(el.options).forEach(function (o) { o.selected = false; });
                } else if (tag === "SELECT") {
                    el.selectedIndex = -1;
                    el.value = "";
                } else {
                    el.value = "";
                }

                el.dispatchEvent(new Event("change", { bubbles: true }));
                el.dispatchEvent(new Event("input", { bubbles: true }));
            }

            // ---- Options + setup ----
            var containerDepth = (options && options.containerDepth) || 3;
            var LOG = !!(options && options.log);

            function apply(rule) {
                var target = document.querySelector(rule.target);
                if (!target) return;

                var show = !!rule.when({
                    val: function (s) { return val(document.querySelector(s)); },
                    get: function (s) { return document.querySelector(s); },
                    targetEl: target
                });

                var container = fieldWrap(target, containerDepth);
                if (LOG) console.log("[Conditional]", rule.target, "=>", show ? "SHOW" : "HIDE", container);
                container.style.display = show ? "" : "none";

                if (!show && rule.clearWhenHidden) clearValue(target);
            }

            rules.forEach(function (rule) {
                var depEls = (rule.deps || []).map(function (d) { return document.querySelector(d); }).filter(Boolean);
                depEls.forEach(function (el) {
                    ["input", "change"].forEach(function (evt) {
                        el.addEventListener(evt, function () { apply(rule); });
                    });
                });
                apply(rule); // initial
            });

            return function reapplyAll() { rules.forEach(apply); };
        }

    };

})();
