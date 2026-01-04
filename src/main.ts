/*****************************************************************************
 * Copyright (c) 2025 Sadret
 *
 * The OpenRCT2 plug-in "Scenery Group Loader" is licensed
 * under the GNU General Public License version 3.
 *****************************************************************************/

/// <reference path="../../OpenRCT2/distribution/openrct2.d.ts" />
import { button, compute, dropdown, groupbox, horizontal, label, listview, store, textbox, twoway, vertical, window } from 'openrct2-flexui';

/*
 * CLASSES
 */

class Set {
    private readonly items: { [key: string]: undefined } = {};

    constructor(initialItems?: string[]) {
        if (initialItems)
            initialItems.forEach(item => this.add(item));
    }

    add(item: string): void {
        this.items[item] = undefined;
    }
    has(item: string): boolean {
        return this.items.hasOwnProperty(item);
    }
    remove(item: string): void {
        delete this.items[item];
    }
    toArray(): string[] {
        return Object.keys(this.items);
    }
}

class Map {
    private readonly items: { [key: string]: string } = {};

    set(item: string, value: string): void {
        this.items[item] = value;
    }
    get(item: string): string | undefined {
        return this.items[item];
    }
    has(item: string): boolean {
        return this.items.hasOwnProperty(item);
    }
    remove(item: string): void {
        delete this.items[item];
    }
}

/*
 * TYPES
 */

type GroupInfo = {
    name: string;
    identifier: string;
    authors: string;
    items: string[];
};

/*
 * UTILITIES
 */

function toDisplayString(text: string): string {
    return text.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function padLeft(str: string, length: number): string {
    const len = str.split("").reduce((len, char) => len + charLen(char), 0) + str.length - 1;
    return len < length ? " ".repeat((length - len) / 2) + str : str;
}

function charLen(str: string): number {
    switch (str) {
        case " ": return 1;
        case "/": return 5;
        case "0": return 7;
        case "1": return 4;
        // case "?": return 6;
        default: return 6;
    }
}

function getCounterLabel(count: number, max: number): string {
    return (count === max ? "{RED}" : "") + `${count} / ${max}`;
}

/*
 * MAIN
 */

registerPlugin({
    name: "scenery-group-loader",
    version: "1.0.0",
    authors: ["Sadret"],
    type: "local",
    licence: "GPL-3.0",
    minApiVersion: 0,
    targetApiVersion: 0,
    main: () => {
        if (typeof ui === "undefined")
            return;

        const objInfoCache = new Map();
        {
            const time = Date.now();
            // cache installed objects info
            objectManager.installedObjects.forEach(obj => objInfoCache.set(obj.identifier, obj.type));
            const elapsed = Date.now() - time;
            console.log(`[Scenery Group Loader] Cached object types in ${elapsed}ms.`);
        }
        const installedGroups: GroupInfo[] = [];
        const authors: string[] = ["< All >"];
        {
            const time = Date.now();
            // cache scenery groups and their items with checksummed identifiers
            const idMapCache = new Map();
            objectManager.installedObjects.forEach(obj => {
                const match = obj.identifier.match(/(.{8}\|.{8})\|.{8}/);
                if (match) idMapCache.set(match[1], obj.identifier);
            });
            const loadedGroups = new Set(objectManager.getAllObjects("scenery_group").map(group => group.identifier));
            const authorCache = new Set();
            objectManager.installedObjects.filter(obj => obj.type === "scenery_group").forEach(installedGroup => {
                const authors = installedGroup.authors.join(", ") || "< Unknown >";
                authorCache.add(authors);
                installedGroups.push({
                    name: installedGroup.name,
                    identifier: installedGroup.identifier,
                    authors,
                    items: (objectManager.load(installedGroup.identifier) as SceneryGroupObject).items.map(id => {
                        const match = id.match(/(.{8}\|.{8})\|.{8}/);
                        return match && idMapCache.get(match[1]) || id;
                    }),
                });
                if (!loadedGroups.has(installedGroup.identifier))
                    objectManager.unload(installedGroup.identifier);
            });
            authors.push(...authorCache.toArray().sort());
            const elapsed = Date.now() - time;
            console.log(`[Scenery Group Loader] Cached scenery groups and items in ${elapsed}ms.`);
        }

        function showWindow(): void {
            // loaded objects cache
            const loaded = new Set();
            function load(id: string): boolean {
                if (isLoaded(id))
                    return false;
                const obj = objectManager.load(id);
                if (!obj)
                    return false;
                loaded.add(id);
                return true;
            }
            function unload(arg: string | string[]): void {
                if (Array.isArray(arg)) {
                    objectManager.unload(arg);
                    arg.forEach(id => loaded.remove(id));
                } else {
                    objectManager.unload(arg);
                    loaded.remove(arg);
                }
            }
            function unloadUnused(objects: string[]): number {
                // find items that are unused and can be unloaded
                const time = Date.now();
                const canUnload = new Set(objects);
                for (let x = 0; x < map.size.x; x++)
                    for (let y = 0; y < map.size.y; y++)
                        for (const element of map.getTile(x, y).elements)
                            switch (element.type) {
                                case "footpath":
                                    if (element.addition)
                                        canUnload.remove(objectManager.getObject("footpath_addition", element.addition).identifier);
                                    break;
                                case "small_scenery":
                                case "wall":
                                case "large_scenery":
                                case "banner":
                                    canUnload.remove(objectManager.getObject(element.type, element.object).identifier);
                                    break;
                            }

                const elapsed = Date.now() - time;
                console.log(`[Scenery Group Loader] Checked scenery usage in ${elapsed}ms.`);

                // close scenery window if open
                for (let i = 0; i < ui.windows; i++) {
                    const win = ui.getWindow(i);
                    if (win.classification == 18) {
                        win.close();
                        break;
                    }
                }

                // unload items
                const canUnloadArr = canUnload.toArray();
                unload(canUnloadArr);
                console.log(`[Scenery Group Loader] Unloaded ${canUnloadArr.length} objects in ${Date.now() - time - elapsed}ms.`);

                return canUnloadArr.length;
            }
            function isLoaded(id: string): boolean {
                return loaded.has(id);
            }
            // initialise cache
            (["scenery_group", "small_scenery", "large_scenery", "wall", "footpath_addition", "banner", "peep_animations"] satisfies ObjectType[]).forEach(type =>
                objectManager.getAllObjects(type).forEach(obj => loaded.add(obj.identifier))
            );

            // scenery group filter
            const searchFilter = store<string>("");
            const statusFilter = store<number>(0);
            const authorFilter = store<number>(0);
            const filteredGroups = compute(searchFilter, statusFilter, authorFilter, (searchValue, statusValue, authorValue) =>
                installedGroups.filter(group => ["name", "identifier", "authors"].some(key =>
                    (group[key as keyof typeof group] || "")
                        .toString()
                        .toLowerCase()
                        .includes(searchValue.toLowerCase())
                    && (statusValue === 0 || (statusValue === 1 && isLoaded(group.identifier)) || (statusValue === 2 && !isLoaded(group.identifier)))
                    && (authorValue === 0 || group.authors === authors[authorValue])
                ))
            );

            // listview items
            function getStatus(group: GroupInfo): string {
                if (!isLoaded(group.identifier))
                    return "Not loaded";
                const loaded = group.items.filter(isLoaded);
                if (group.items.length === loaded.length)
                    return `All ${group.items.length} objects loaded`;
                return `${loaded.length}/${group.items.length} objects loaded`;
            }
            const toggle = store<boolean>(false);
            const listViewItems = compute(filteredGroups, toggle, value => value.map(group => [
                group.name,
                group.identifier,
                group.authors,
                getStatus(group),
            ]));

            // highlighted group
            const selectedGroup = store<GroupInfo | null>(null);

            window({
                width: {
                    min: 512,
                    value: 1536,
                    max: 2048,
                },
                height: {
                    min: 256,
                    value: 512,
                    max: 1024,
                },
                position: "center",
                title: "Scenery Group Loader",
                content: [
                    horizontal([
                        vertical({
                            width: "4w",
                            content: [
                                horizontal([
                                    label({
                                        text: "Name / Identifier:",
                                        width: 96,
                                    }),
                                    textbox({
                                        text: twoway(searchFilter),
                                    }),
                                    button({
                                        text: "Clear",
                                        onClick: () => searchFilter.set(""),
                                        width: 64,
                                        height: 14,
                                    }),
                                    label({
                                        padding: { left: 16 },
                                        text: "Authors:",
                                        width: 50,
                                    }),
                                    dropdown({
                                        width: 200,
                                        items: authors,
                                        selectedIndex: twoway(authorFilter),
                                    }),
                                    label({
                                        padding: { left: 16 },
                                        text: "Status:",
                                        width: 43,
                                    }),
                                    dropdown({
                                        width: 100,
                                        items: ["All", "Loaded", "Not loaded"],
                                        selectedIndex: twoway(statusFilter),
                                    }),
                                ]),
                                listview({
                                    columns: [
                                        { header: "Name", width: "2w", canSort: true, },
                                        { header: "Identifier", width: "2w", canSort: true, },
                                        { header: "Author(s)", width: "1w", canSort: true, },
                                        { header: "Status", width: "1w", canSort: true, },
                                    ],
                                    items: listViewItems,
                                    onClick: index => {
                                        const group = filteredGroups.get()[index];
                                        if (group.items.map(load).some(Boolean))
                                            load(group.identifier);
                                        else if (unloadUnused(group.items) === group.items.length)
                                            unload(group.identifier);
                                        // force ui update
                                        toggle.set(!toggle.get());
                                    },
                                    onHighlight: index => selectedGroup.set(filteredGroups.get()[index]),
                                }),
                                horizontal([
                                    ...(["small_scenery", "large_scenery", "wall", "footpath_addition", "banner", "peep_animations"] satisfies ObjectType[]).map((type, idx) => label({
                                        text: compute(toggle, () => `${toDisplayString(type)}:   ${getCounterLabel(objectManager.getAllObjects(type).length, idx < 3 ? 2047 : 255)}`),
                                    })),
                                    button({
                                        text: "Unload all unused",
                                        height: 14,
                                        onClick: () => {
                                            unloadUnused(loaded.toArray().filter(obj => objInfoCache.get(obj) !== "scenery_group").filter(obj => objInfoCache.get(obj) !== "peep_animations"));
                                            const time = Date.now();
                                            installedGroups.filter(
                                                group => isLoaded(group.identifier)
                                            ).forEach(
                                                group => group.items.some(isLoaded) || unload(group.identifier)
                                            );
                                            console.log(`[Scenery Group Loader] Unloaded unused groups in ${Date.now() - time}ms.`);
                                            // force ui update
                                            toggle.set(!toggle.get());
                                        },
                                    }),
                                ]),
                            ],
                        }),
                        vertical([
                            label({ text: "" }),
                            groupbox({
                                width: "1w",
                                height: "1w",
                                text: "Scenery Group Information",
                                content: [
                                    label({ text: "{BLACK}Name:" }),
                                    label({ text: compute(selectedGroup, group => group ? group.name : "None"), padding: { left: 16 } }),
                                    label({ text: "{BLACK}Identifier:" }),
                                    label({ text: compute(selectedGroup, group => group ? group.identifier : "None"), padding: { left: 16 } }),
                                    label({ text: "{BLACK}Author(s):" }),
                                    label({ text: compute(selectedGroup, group => group ? group.authors : "None"), padding: { left: 16 } }),
                                    label({ text: "{BLACK}Status:" }),
                                    label({ text: compute(selectedGroup, toggle, group => (group && isLoaded(group.identifier)) ? "Loaded" : "Not Loaded"), padding: { left: 16 } }),
                                    label({ text: "{BLACK}Objects   (Loaded / Total):" }),
                                    horizontal([
                                        label({ text: "TOTAL:", padding: { left: 16 } }),
                                        label({
                                            width: 25,
                                            text: compute(selectedGroup, toggle, group => {
                                                if (!group) return padLeft("?", 23);
                                                const loaded = group.items.filter(isLoaded);
                                                return padLeft(`${loaded.length}`, 23);
                                            }),
                                        }),
                                        label({
                                            width: 7,
                                            text: "/",
                                        }),
                                        label({
                                            width: 25,
                                            text: compute(selectedGroup, toggle, group => {
                                                if (!group) return padLeft("?", 23);
                                                return padLeft(String(group.items.length), 23);
                                            }),
                                        }),
                                    ]),
                                    ...(["small_scenery", "large_scenery", "wall", "footpath_addition", "banner", "peep_animations"] satisfies ObjectType[]).map(type =>
                                        horizontal([
                                            label({
                                                text: `${toDisplayString(type)}:`,
                                                padding: { left: 16 },
                                            }),
                                            label({
                                                width: 25,
                                                text: compute(selectedGroup, toggle, group => {
                                                    if (!group) return padLeft("?", 23);
                                                    const loaded = group.items.filter(id => objInfoCache.get(id) === type && isLoaded(id));
                                                    return padLeft(`${loaded.length}`, 23);
                                                }),
                                            }),
                                            label({
                                                width: 7,
                                                text: "/",
                                            }),
                                            label({
                                                width: 25,
                                                text: compute(selectedGroup, toggle, group => {
                                                    if (!group) return padLeft("?", 23);
                                                    const objects = group.items.filter(id => objInfoCache.get(id) === type);
                                                    return padLeft(String(objects.length), 23);
                                                }),
                                            }),
                                        ]),
                                    ),
                                    button({
                                        padding: { top: 16 },
                                        text: compute(selectedGroup, toggle, group => (group && isLoaded(group.identifier))
                                            ? "Unload only group (but do not unload objects)"
                                            : "Load only group (but do not load objects)"
                                        ),
                                        disabled: compute(selectedGroup, group => group === null),
                                        onClick: () => {
                                            const group = selectedGroup.get();
                                            if (group) {
                                                if (isLoaded(group.identifier))
                                                    unload(group.identifier);
                                                else
                                                    load(group.identifier);
                                                // force ui update
                                                toggle.set(!toggle.get());
                                            }
                                        },
                                    }),
                                    button({
                                        text: compute(selectedGroup, toggle, group => (group && isLoaded(group.identifier))
                                            ? "Unload group and all objects (if unused)"
                                            : "Load group and all objects"
                                        ),
                                        disabled: compute(selectedGroup, group => group === null),
                                        onClick: () => {
                                            const group = selectedGroup.get();
                                            if (group) {
                                                if (isLoaded(group.identifier)) {
                                                    if (unloadUnused(group.items) === group.items.length)
                                                        unload(group.identifier);
                                                } else {
                                                    load(group.identifier);
                                                    group.items.forEach(load);
                                                }
                                                // force ui update
                                                toggle.set(!toggle.get());
                                            }
                                        },
                                    }),
                                ],
                            }),
                            label({
                                text: "Copyright (c) 2026 Sadret",
                                disabled: true,
                                alignment: "centred",
                            }),
                        ]),
                    ]),
                ],
            }).open();
        }

        ui.registerMenuItem("Scenery Group Loader", showWindow);
        showWindow(); // remove after testing
    },
});