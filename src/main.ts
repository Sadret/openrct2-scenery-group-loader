/*****************************************************************************
 * Copyright (c) 2025 Sadret
 *
 * The OpenRCT2 plug-in "Scenery Group Loader" is licensed
 * under the GNU General Public License version 3.
 *****************************************************************************/

/// <reference path="../../OpenRCT2/distribution/openrct2.d.ts" />
import { arrayStore, button, compute, horizontal, label, listview, store, textbox, twoway, window } from 'openrct2-flexui';

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
        showWindow();
        // console.log(objectManager.installedObjects.filter(obj => obj.type === "scenery_group").map(obj => obj.name));
    },
});

function showWindow(): void {
    const installed = objectManager.installedObjects.filter(obj => obj.type === "scenery_group");
    const loaded: { [key: string]: undefined } = {};
    objectManager.getAllObjects("scenery_group").forEach(obj => loaded[obj.identifier] = undefined);

    const filter = store<string>("");
    const filtered = compute(filter, value =>
        installed.filter(group => ["name", "identifier", "authors"].some(key =>
            (group[key as keyof typeof group] || "")
                .toString()
                .toLowerCase()
                .includes(value.toLowerCase())
        ))
    );
    function groupToItem(group: InstalledObject): string[] {
        return [
            group.name,
            group.identifier,
            group.authors.join(", "),
            loaded.hasOwnProperty(group.identifier) ? "Loaded" : "Not Loaded",
        ];
    }
    const items = arrayStore<string[]>();
    filtered.subscribe(value => items.set(value.map(groupToItem)));
    items.set(filtered.get().map(groupToItem));

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
                    { header: "Name", width: "40%", canSort: true, },
                    { header: "Identifier", width: "40%", canSort: true, },
                    { header: "Author(s)", width: "10%", canSort: true, },
                    { header: "Status", width: "10%", canSort: true, },
                ],
                items,
                onClick: (index: number) => {
                    const group = filtered.get()[index];
                    if (loaded.hasOwnProperty(group.identifier)) {
                        objectManager.unload(group.identifier);
                        delete loaded[group.identifier];
                        items.get()[index][3] = "Not Loaded";
                        items.set(index, items.get()[index]);
                    } else {
                        objectManager.load(group.identifier);
                        loaded[group.identifier] = undefined;
                        items.get()[index][3] = "Loaded";
                        items.set(index, items.get()[index]);
                    }
                },
            }),
        ],
    }).open();
}
