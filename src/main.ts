/*****************************************************************************
 * Copyright (c) 2025 Sadret
 *
 * The OpenRCT2 plug-in "Scenery Group Loader" is licensed
 * under the GNU General Public License version 3.
 *****************************************************************************/

/// <reference path="../../OpenRCT2/distribution/openrct2.d.ts" />
import { button, compute, horizontal, label, listview, store, textbox, twoway, window } from 'openrct2-flexui';

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

        ui.registerMenuItem("Load Scenery Groups", showWindow);
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
        id = objectManager.load(id)?.identifier || id;
        if (!loadedObjects.has(id))
            objectManager.unload(id);
        return id;
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
            listview({
                columns: [
                    { header: "Name", width: "2w", canSort: true, },
                    { header: "Identifier", width: "2w", canSort: true, },
                    { header: "Author(s)", width: "1w", canSort: true, },
                    { header: "Status", width: "1w", canSort: true, },
                ],
                items: listViewItems,
                onClick,
            }),
            horizontal((["small_scenery", "large_scenery", "wall"] satisfies ObjectType[]).map(type => label({
                text: compute(toggle, () => `${type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}: ${objectManager.getAllObjects(type).length}/2047`),
            }))),
        ],
    }).open();
}
