import ParserPool from "ui5plugin-parser/dist/parser/pool/ParserPool";
import * as vscode from "vscode";
import { UI5Plugin } from "../../UI5Plugin";

export class ClearCacheCommand {
	static subscribeToPropertyChange() {
		const disposable = vscode.workspace.onDidChangeConfiguration(event => {
			const isAnyConfigurationAffected =
				event.affectsConfiguration("ui5.plugin.ui5version") ||
				event.affectsConfiguration("ui5.plugin.src") ||
				event.affectsConfiguration("ui5.plugin.jsCodeLens") ||
				event.affectsConfiguration("ui5.plugin.xmlCodeLens") ||
				event.affectsConfiguration("ui5.plugin.signatureHelp") ||
				event.affectsConfiguration("ui5.plugin.libsToLoad") ||
				event.affectsConfiguration("ui5.plugin.dataSource") ||
				event.affectsConfiguration("ui5.plugin.xmlDiagnostics") ||
				event.affectsConfiguration("ui5.plugin.excludeFolderPattern");

			if (
				event.affectsConfiguration("ui5.plugin.libsToLoad") ||
				event.affectsConfiguration("ui5.plugin.dataSource")
			) {
				this.clearCache();
			} else if (isAnyConfigurationAffected) {
				ClearCacheCommand.reloadWindow();
			}
		});

		UI5Plugin.getInstance().addDisposable(disposable);
	}

	static clearCache() {
		ParserPool.clearCache();

		ClearCacheCommand.reloadWindow();
	}

	public static reloadWindow() {
		const action = "Reload";
		vscode.window
			.showInformationMessage(
				"Reload window in order for change in extension ui5.plugin configuration to take effect.",
				action
			)
			.then(selectedAction => {
				if (selectedAction === action) {
					vscode.commands.executeCommand("workbench.action.reloadWindow");
				}
			});
	}
}
