/*****************************************************************************
 * Copyright (c) 2025 Sadret
 *
 * The OpenRCT2 plug-in "Scenery Group Loader" is licensed
 * under the GNU General Public License version 3.
 *****************************************************************************/

/// <reference path="../../OpenRCT2/distribution/openrct2.d.ts" />
import { button, compute, groupbox, horizontal, label, listview, store, textbox, twoway, vertical, window } from 'openrct2-flexui';

class Set {
    private items: { [key: string]: undefined } = {};

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
    private items: { [key: string]: string } = {};

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

        ui.registerMenuItem("Load Scenery Groups", showWindow); // todo: change
        showWindow(); // remove after testing
    },
});

function showWindow(): void {
    const loadedObjects = new Set();
    (["footpath", "small_scenery", "wall", "large_scenery", "banner"] satisfies ObjectType[]).forEach(type =>
        objectManager.getAllObjects(type).forEach(obj => loadedObjects.add(obj.identifier))
    );

    const installedGroups = objectManager.installedObjects.filter(obj => obj.type === "scenery_group");
    const loadedGroups = new Set(objectManager.getAllObjects("scenery_group").map(obj => obj.identifier));

    const filter = store<string>("");
    const filteredGroups = compute(filter, value =>
        installedGroups.filter(group => ["name", "identifier", "authors"].some(key =>
            (group[key as keyof typeof group] || "")
                .toString()
                .toLowerCase()
                .includes(value.toLowerCase())
        ))
    );

    const cache = new Map();
    function canonical(id: string) {
        if (cache.has(id))
            return cache.get(id)!;
        const canonId = objectManager.load(id)?.identifier || id;
        cache.set(id, canonId);
        if (!loadedObjects.has(canonId))
            objectManager.unload(canonId);
        return canonId;
    }

    const cache2 = new Map();
    function getType(id: string) {
        if (cache2.has(id))
            return cache2.get(id)!;
        const loadedObject = objectManager.load(id);
        const type = loadedObject?.type || "unknown";
        cache2.set(id, type);
        return type;
    }

    function getLoadedGroup(id: string): SceneryGroupObject {
        return objectManager.load(id) as SceneryGroupObject;
    }

    function getStatus(group: InstalledObject): string {
        if (!loadedGroups.has(group.identifier))
            return "Not loaded";
        const objects = getLoadedGroup(group.identifier).items;
        const loaded = objects.filter(id => loadedObjects.has(canonical(id))).length;
        if (objects.length === loaded)
            return `All ${objects.length} objects loaded`;
        return `${loaded}/${objects.length} objects loaded`;
    }
    const toggle = store<boolean>(false);
    const listViewItems = compute(filteredGroups, toggle, value => value.map(group => [
        group.name,
        group.identifier,
        group.authors.join(", "),
        getStatus(group),
    ]));

    function onClick(index: number): void {
        const group = filteredGroups.get()[index];
        const loadedGroup = getLoadedGroup(group.identifier);
        if (loadedGroup.items.map(canonical).every(id => loadedObjects.has(id))) {
            // find items that are unused and can be unloaded
            const canUnload = new Set(loadedGroup.items.map(canonical));
            for (let x = 0; x < map.size.x; x++)
                for (let y = 0; y < map.size.y; y++)
                    for (const element of map.getTile(x, y).elements)
                        switch (element.type) {
                            case "footpath":
                                if (element.object)
                                    canUnload.remove(objectManager.getObject("footpath", element.object).identifier);
                                if (element.surfaceObject)
                                    canUnload.remove(objectManager.getObject("footpath_surface", element.surfaceObject).identifier);
                                if (element.railingsObject)
                                    canUnload.remove(objectManager.getObject("footpath_railings", element.railingsObject).identifier);
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
            canUnloadArr.forEach(id => {
                objectManager.unload(id);
                loadedObjects.remove(id);
            });

            if (canUnloadArr.length === loadedGroup.items.length) {
                loadedGroups.remove(loadedGroup.identifier);
                objectManager.unload(loadedGroup.identifier);
            }
        } else {
            loadedGroups.add(loadedGroup.identifier);
            objectManager.load(loadedGroup.items);
            loadedGroup.items.map(canonical).forEach(id => loadedObjects.add(id));
        }
        toggle.set(!toggle.get()); // force ui update
    }

    const highlightedInstalled = store<InstalledObject | null>(null);
    const highlightedLoaded = compute(highlightedInstalled, toggle, group => group && loadedGroups.has(group.identifier) && getLoadedGroup(group.identifier));
    function onHighlight(index: number): void {
        highlightedInstalled.set(filteredGroups.get()[index]);
    }

    window({
        width: {
            min: 512,
            value: 1024,
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
                label({
                    text: "Search:",
                    width: 64,
                }),
                textbox({
                    text: twoway(filter),
                }),
                button({
                    text: "Clear",
                    onClick: () => filter.set(""),
                    width: 64,
                    height: 14,
                }),
            ]),
            horizontal([
                vertical({
                    width: "3w",
                    content: [
                        listview({
                            columns: [
                                { header: "Name", width: "2w", canSort: true, },
                                { header: "Identifier", width: "2w", canSort: true, },
                                { header: "Author(s)", width: "1w", canSort: true, },
                                { header: "Status", width: "1w", canSort: true, },
                            ],
                            items: listViewItems,
                            onClick,
                            onHighlight,
                        }),
                    ],
                }),
                groupbox({
                    width: "1w",
                    height: "1w",
                    text: "Scenery Group Information",
                    content: [
                        label({ text: "{BLACK}Name:" }),
                        label({ text: compute(highlightedInstalled, group => group ? group.name : "None"), padding: { left: 16 } }),
                        label({ text: "{BLACK}Identifier:" }),
                        label({ text: compute(highlightedInstalled, group => group ? group.identifier : "None"), padding: { left: 16 } }),
                        label({ text: "{BLACK}Author(s):" }),
                        label({ text: compute(highlightedInstalled, group => group ? group.authors.join(", ") : "None"), padding: { left: 16 } }),
                        label({ text: "{BLACK}Status:" }),
                        label({ text: compute(highlightedLoaded, group => group ? "Loaded" : "Not Loaded"), padding: { left: 16 } }),
                        label({ text: "{BLACK}Objects (Loaded / Total):" }),
                        horizontal([
                            label({ text: "TOTAL:", padding: { left: 16 } }),
                            label({
                                width: 64,
                                text: compute(highlightedLoaded, group => {
                                    if (!group) return padLeft("?", 64);
                                    const objects = group.items;
                                    const loaded = objects.filter(id => loadedObjects.has(canonical(id)));
                                    return padLeft(`${loaded.length} / ${objects.length}`, 64);
                                }),
                            }),
                        ]),
                        ...(["small_scenery", "large_scenery", "wall", "footpath_addition", "banner", "peep_animations"] satisfies ObjectType[]).map(type =>
                            horizontal([
                                label({ text: `${toDisplayString(type)}:`, padding: { left: 16 } }),
                                label({
                                    width: 64,
                                    text: compute(highlightedLoaded, group => {
                                        if (!group) return padLeft("?", 64);
                                        const objects = group.items.filter(id => getType(id) === type);
                                        const loaded = objects.filter(id => loadedObjects.has(canonical(id)));
                                        return padLeft(`${loaded.length} / ${objects.length}`, 64);
                                    }),
                                }),
                            ]),
                        ),
                    ],
                }),
            ]),
            horizontal((["small_scenery", "large_scenery", "wall", "footpath_addition", "banner", "peep_animations"] satisfies ObjectType[]).map((type, idx) => label({
                text: compute(toggle, () => `${toDisplayString(type)}:   ${objectManager.getAllObjects(type).length} / ${idx < 3 ? 2047 : 255}`),
            }))),
        ],
    }).open();
}

function toDisplayString(text: string): string {
    return text.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function padLeft(str: string, length: number): string {
    const len = str.split("").reduce((len, char) => len + charLen(char), 0) + str.length - 1;
    return len < 62 ? " ".repeat((62 - len) / 2) + str : str;
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