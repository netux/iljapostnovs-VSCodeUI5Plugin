import * as vscode from "vscode";
import { FileReader } from "../Util/FileReader";

export class ClearCacheCommand {
	static subscribeToPropertyChange() {
		vscode.workspace.onDidChangeConfiguration(event => {
			const isAnyConfigurationAffected =
				event.affectsConfiguration("ui5.plugin.ui5version") ||
				event.affectsConfiguration("ui5.plugin.src") ||
				event.affectsConfiguration("ui5.plugin.jsCodeLens") ||
				event.affectsConfiguration("ui5.plugin.xmlCodeLens") ||
				event.affectsConfiguration("ui5.plugin.signatureHelp") ||
				event.affectsConfiguration("ui5.plugin.libsToLoad") ||
				event.affectsConfiguration("ui5.plugin.xmlDiagnostics");

			if (event.affectsConfiguration("ui5.plugin.libsToLoad")) {
				this.clearCache();
			} else if (isAnyConfigurationAffected) {
				ClearCacheCommand.reloadWindow();
			}
		});
	}

	static clearCache() {
		FileReader.clearCache();

		ClearCacheCommand.reloadWindow();
	}

	private static reloadWindow() {
		const action = "Reload";
		vscode.window
		.showInformationMessage( `Reload window in order for change in extension ui5.plugin configuration to take effect.`, action)
		.then(selectedAction => {
			if (selectedAction === action) {
				vscode.commands.executeCommand("workbench.action.reloadWindow");
			}
		});
	}
}