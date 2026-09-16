/// <reference types="@vicinae/api">

/*
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 */

type ExtensionPreferences = {
  
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