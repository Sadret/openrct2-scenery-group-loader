import resolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";

export default {
	input: "./src/main.ts",
	output: {
		format: "iife",
		file: `./build/openrct2-scenery-group-loader-${version}.js`,
	},
	plugins: [
		resolve(),
		typescript(),
		terser({
			format: {
				preamble: "\
// Copyright (c) 2025 Sadret\n\
// This software is licensed under the GNU General Public License version 3.\n\
// The full text of the license can be found here: https://github.com/Sadret/openrct2-scenery-group-loader\
				",
			},
		}),
	],
};
