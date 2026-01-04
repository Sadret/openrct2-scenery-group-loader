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

function getCount(type: ObjectType): number {
    return objectManager.getAllObjects(type).length;
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

        ui.registerMenuItem("Scenery Group Loader", openWindow);
        ui.registerShortcut({
            id: "openrct2.scenery-group-loader.open-window",
            text: "Open Scenery Group Loader",
            callback: openWindow,
        });
    },
});

// persistent caches
const objInfoCache = new Map();
const installedGroups: GroupInfo[] = [];
const authors: string[] = ["< All >"];

function openWindow(): void {
    if (installedGroups.length === 0) {
        // cache installed objects info
        const types = new Set(["scenery_group", "small_scenery", "large_scenery", "wall", "footpath_addition", "banner"] satisfies ObjectType[]);
        objectManager.installedObjects.forEach(obj => types.has(obj.type) && objInfoCache.set(obj.identifier, obj.type));

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
                }).filter(id => objInfoCache.has(id)),
            });
            if (!loadedGroups.has(installedGroup.identifier))
                objectManager.unload(installedGroup.identifier);
        });
        authors.push(...authorCache.toArray().sort());
    }

    // cache loaded objects
    const loaded = new Set();
    (["scenery_group", "small_scenery", "large_scenery", "wall", "footpath_addition", "banner"] satisfies ObjectType[]).forEach(
        type => objectManager.getAllObjects(type).forEach(obj => loaded.add(obj.identifier))
    );

    function isLoaded(id: string): boolean {
        return loaded.has(id);
    }
    function load(id: string): boolean {
        return !isLoaded(id) && loadAll([id]);
    }
    function loadAll(ids: string[]): boolean {
        ids = ids.filter(id => !isLoaded(id));
        let objs = objectManager.load(ids).filter(obj => obj !== null);
        if (!objs.length)
            return false;
        objs.forEach(obj => loaded.add(obj.identifier));
        return true;
    }
    function unload(id: string): void {
        isLoaded(id) && unloadAll([id]);
    }
    function unloadAll(ids: string[]): void {
        ids = ids.filter(isLoaded);
        objectManager.unload(ids);
        ids.forEach(id => loaded.remove(id));
    }
    function unloadUnused(objects: string[]): number {
        // find items that are unused and can be unloaded
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
        unloadAll(canUnloadArr);

        return canUnloadArr.length;
    }

    // ui toggle to force updates
    const toggle = store<boolean>(false);

    // scenery group filter
    const searchFilter = store<string>("");
    const statusFilter = store<number>(0);
    const authorFilter = store<number>(0);
    const filteredGroups = compute(searchFilter, statusFilter, authorFilter, toggle, (searchValue, statusValue, authorValue) =>
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
            min: 1024,
            value: 1536,
            max: 8192,
        },
        height: {
            min: 512,
            value: 768,
            max: 2048,
        },
        position: "center",
        title: "Scenery Group Loader (v.1.0.0)",
        content: [
            horizontal([
                vertical({
                    width: "4w",
                    content: [
                        horizontal([
                            horizontal({
                                width: "4w",
                                content: [
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
                                        padding: { left: 10 },
                                        text: "Author(s):",
                                        width: 58,
                                    }),
                                ],
                            }),
                            horizontal({
                                width: "1w",
                                content: [
                                    dropdown({
                                        padding: { right: 13 },
                                        items: authors,
                                        selectedIndex: twoway(authorFilter),
                                    }),
                                ],
                            }),
                            horizontal({
                                width: 147,
                                content: [
                                    label({
                                        text: "Status:",
                                        width: 43,
                                        padding: { left: -3 },
                                    }),
                                    dropdown({
                                        width: 103,
                                        items: ["All", "Loaded", "Not loaded"],
                                        selectedIndex: twoway(statusFilter),
                                    }),
                                ],
                            }),
                        ]),
                        listview({
                            columns: [
                                { header: "Name", width: "2w", canSort: true, },
                                { header: "Identifier", width: "2w", canSort: true, },
                                { header: "Author(s)", width: "1w", canSort: true, },
                                { header: "Status", width: 150, canSort: true, },
                            ],
                            items: listViewItems,
                            onClick: index => {
                                const group = filteredGroups.get()[index];
                                if (loadAll(group.items)) {
                                    load(group.identifier);
                                } else if (unloadUnused(group.items) === group.items.length)
                                    unload(group.identifier);
                                // force ui update
                                toggle.set(!toggle.get());
                            },
                            onHighlight: index => selectedGroup.set(filteredGroups.get()[index]),
                        }),
                    ],
                }),
                vertical({
                    width: 300,
                    content: [
                        button({
                            width: 50,
                            height: 14,
                            padding: { left: "1w" },
                            text: "Help",
                            onClick: openHelpWindow,
                        }),
                        groupbox({
                            text: "{BLACK}Scenery Group Information:",
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
                                        width: 30,
                                        text: compute(selectedGroup, toggle, group => {
                                            if (!group) return padLeft("?", 28);
                                            return padLeft(String(group.items.length), 28);
                                        }),
                                    }),
                                ]),
                                ...(["small_scenery", "large_scenery", "wall", "footpath_addition", "banner"] satisfies ObjectType[]).map(type =>
                                    horizontal([
                                        label({
                                            text: `${toDisplayString(type)}:`,
                                            padding: { left: 16 },
                                        }),
                                        label({
                                            width: 32,
                                            text: compute(selectedGroup, toggle, group => {
                                                if (!group) return padLeft("?", 30);
                                                const loaded = group.items.filter(id => objInfoCache.get(id) === type && isLoaded(id));
                                                return padLeft(`${loaded.length}`, 30);
                                            }),
                                        }),
                                        label({
                                            width: 7,
                                            text: "/",
                                        }),
                                        label({
                                            width: 30,
                                            text: compute(selectedGroup, toggle, group => {
                                                if (!group) return padLeft("?", 28);
                                                const objects = group.items.filter(id => objInfoCache.get(id) === type);
                                                return padLeft(String(objects.length), 28);
                                            }),
                                        }),
                                    ]),
                                ),
                            ],
                        }),
                        groupbox({
                            padding: { top: "1w" },
                            text: "{BLACK}Loaded Objects Information (Loaded / Maximum):",
                            content: [
                                ...(["small_scenery", "large_scenery", "wall", "footpath_addition", "banner", "scenery_group"] satisfies ObjectType[]).map(
                                    (type, idx) => ([type, idx < 3 ? 2047 : 255] satisfies [string, number]),
                                ).map(
                                    ([type, max]) =>
                                        horizontal([
                                            label({
                                                text: `${toDisplayString(type)}:`,
                                                padding: { left: 16 },
                                            }),
                                            label({
                                                width: 32,
                                                text: compute(toggle, () => (getCount(type) === max ? "{RED}" : "") + padLeft(String(getCount(type)), 30)),
                                            }),
                                            label({
                                                width: 7,
                                                text: compute(toggle, () => (getCount(type) === max ? "{RED}" : "") + "/"),
                                            }),
                                            label({
                                                width: 30,
                                                text: compute(toggle, () => (getCount(type) === max ? "{RED}" : "") + padLeft(String(max), 28)),
                                            }),
                                        ]),
                                ),
                                button({
                                    text: "Unload ALL unused objects and groups",
                                    height: 24,
                                    onClick: () => {
                                        unloadUnused(loaded.toArray().filter(obj => objInfoCache.get(obj) !== "scenery_group"));
                                        installedGroups.filter(
                                            group => isLoaded(group.identifier)
                                        ).forEach(
                                            group => group.items.some(isLoaded) || unload(group.identifier)
                                        );
                                        // force ui update
                                        toggle.set(!toggle.get());
                                    },
                                }),
                            ],
                        }),
                        label({
                            text: "Copyright (c) 2026 Sadret",
                            disabled: true,
                            alignment: "centred",
                        }),
                    ],
                }),
            ]),
        ],
    }).open();
}

function openHelpWindow() {
    window({
        width: 570,
        height: "auto",
        position: "center",
        title: "Scenery Group Loader - Help",
        content: [
            groupbox({
                text: "{BLACK}Instructions:",
                content: [
                    "- Click a row once to load the group and all of its objects.",
                    "- Click a row a second time to unload all unused objects of that group. If all objects of a group are unloaded,",
                    "the group will also be unloaded.",
                    "- Click the button in the bottom right corner to unload all unused objects and all groups without any",
                    "loaded objects.",
                    "- The plugin has a keyboard shortcut to open its window, which can be assigned in OpenRCT2's settings.",
                    "(Options -> Controls -> Shortcut keys... -> last tab -> Open Scenery Group Loader)",
                ].map(text => label({ text })),
            }),
            groupbox({
                text: "{BLACK}Release Information:",
                content: [
                    "Scenery Group Loader v1.0.0",
                    "Copyright (c) 2026 Sadret",
                    "The OpenRCT2 plugin \"Scenery Group Loader\" is licensed under the GNU General Public License version 3.",
                ].map(text => label({ text })),
            }),
            groupbox({
                text: "{BLACK}Contact:",
                content: [
                    "If you like this plugin, please leave a star on GitHub: github.com/Sadret/openrct2-scenery-group-loader",
                    "If you find any bugs or if you have any ideas for improvements, you can open an issue on GitHub or contact",
                    "me on Discord: Sadret#2502",
                ].map(text => label({ text })),
            }),
        ],
    }).open();
}