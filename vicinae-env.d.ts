/// <reference types="@vicinae/api">

/*
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 */

type ExtensionPreferences = {
  /** Relative project paths - Resolve relative project arguments from the configured base directory. */
	"allowRelativePaths": boolean;

	/** Relative path base directory - Used when relative paths are enabled. Enter an absolute directory or ~/path. Empty or ~ uses your home directory (HOME). */
	"relativePathBase": string;
}

declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Command: Layouter */
	export type Layouter = ExtensionPreferences & {
		
	}
}

declare namespace Arguments {
  /** Command: Layouter */
	export type Layouter = {
		/** Project directory (optional) */
		"project": string
	}
}