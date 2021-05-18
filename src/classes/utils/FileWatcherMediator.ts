import * as vscode from "vscode";
import { FileReader } from "./FileReader";
import { AcornSyntaxAnalyzer } from "../UI5Classes/JSParser/AcornSyntaxAnalyzer";
import * as glob from "glob";
import * as fs from "fs";
import { UIClassFactory } from "../UI5Classes/UIClassFactory";
import { ResourceModelData } from "../UI5Classes/ResourceModelData";
import { ClearCacheCommand } from "../vscommands/ClearCacheCommand";
import { UI5Plugin } from "../../UI5Plugin";
import * as path from "path";
import { TemplateGeneratorFactory } from "../templateinserters/TemplateGeneratorFactory";
import { FileRenameMediator } from "../filerenaming/FileRenameMediator";
import { CustomCompletionItem } from "../providers/completionitems/CustomCompletionItem";
import { DiagnosticsRegistrator } from "../registrators/DiagnosticsRegistrator";
import { WorkspaceCompletionItemFactory } from "../providers/completionitems/factories/js/sapuidefine/WorkspaceCompletionItemFactory";
import { IFileChanges } from "../filerenaming/handlers/abstraction/FileRenameHandler";
const fileSeparator = path.sep;
const workspace = vscode.workspace;

export class FileWatcherMediator {
	private static async _onChange(uri: vscode.Uri) {
		const document = await vscode.workspace.openTextDocument(uri);
		if (document.fileName.endsWith(".js")) {

			const currentClassNameDotNotation = AcornSyntaxAnalyzer.getClassNameOfTheCurrentDocument(document.uri.fsPath);
			if (currentClassNameDotNotation) {
				UIClassFactory.setNewCodeForClass(currentClassNameDotNotation, document.getText(), true);
			}
		} else if (document.fileName.endsWith(".view.xml")) {

			const viewContent = document.getText();
			FileReader.setNewViewContentToCache(viewContent, document.uri.fsPath, true);
		} else if (document.fileName.endsWith(".fragment.xml")) {

			FileReader.setNewFragmentContentToCache(document.getText(), document.fileName, true);
		} else if (document.fileName.endsWith(".properties")) {

			ResourceModelData.readTexts();
		} else if (document.fileName.endsWith("manifest.json")) {

			FileReader.rereadAllManifests();
		}
	}
	static register() {
		const watcher = vscode.workspace.createFileSystemWatcher("**/*.{js,xml,json,properties}");
		let disposable = vscode.workspace.onDidChangeWorkspaceFolders(() => {
			ClearCacheCommand.reloadWindow();
		});
		UI5Plugin.getInstance().addDisposable(disposable);

		disposable = vscode.workspace.onDidChangeTextDocument(event => {
			this._onChange(event.document.uri);
		});
		UI5Plugin.getInstance().addDisposable(disposable);

		disposable = watcher.onDidChange(this._onChange);
		UI5Plugin.getInstance().addDisposable(disposable);
		disposable = watcher.onDidCreate(uri => {
			this._handleFileCreate(uri);
		});
		UI5Plugin.getInstance().addDisposable(disposable);

		disposable = workspace.onDidRenameFiles(event => {
			event.files.forEach(file => {
				let fileChanges: IFileChanges[] = [];
				if (file.newUri.fsPath.indexOf(".") === -1) {
					fileChanges = this._handleFolderRename(file.oldUri, file.newUri);
				} else {
					fileChanges = this._handleFileRename(file);
				}

				if (fileChanges) {
					this._applyFileChanges(fileChanges);
				}
			});
		});
		UI5Plugin.getInstance().addDisposable(disposable);

		watcher.onDidDelete(uri => {
			if (uri.fsPath.endsWith(".js")) {
				DiagnosticsRegistrator.removeDiagnosticForUri(uri, "js");
			}
			if (uri.fsPath.endsWith(".xml")) {
				DiagnosticsRegistrator.removeDiagnosticForUri(uri, "xml");
			}

			if (uri.fsPath.endsWith(".js")) {

				const currentClassNameDotNotation = AcornSyntaxAnalyzer.getClassNameOfTheCurrentDocument(uri.fsPath);
				if (currentClassNameDotNotation) {
					UIClassFactory.removeClass(currentClassNameDotNotation);
				}
			} else if (uri.fsPath.endsWith(".xml")) {
				FileReader.removeFromCache(uri.fsPath);
			}
		});
		UI5Plugin.getInstance().addDisposable(disposable);

		disposable = vscode.window.onDidChangeActiveTextEditor(textEditor => {
			if (textEditor?.document.fileName.endsWith(".js")) {

				const currentClassNameDotNotation = AcornSyntaxAnalyzer.getClassNameOfTheCurrentDocument(textEditor?.document.uri.fsPath);
				if (currentClassNameDotNotation) {
					UIClassFactory.setNewCodeForClass(currentClassNameDotNotation, textEditor?.document.getText());
				}
			}
		});
		UI5Plugin.getInstance().addDisposable(disposable);
	}

	private static async _applyFileChanges(fileChanges: IFileChanges[]) {
		const edit = new vscode.WorkspaceEdit();
		const changedTextDocuments: vscode.TextDocument[] = [];
		const changedFiles = fileChanges.filter(fileChange => fileChange.changed);
		for (const changedFile of changedFiles) {
			const document = await vscode.workspace.openTextDocument(changedFile.fileData.fsPath);
			changedTextDocuments.push(document);
			const positionBegin = document.positionAt(0);
			const positionEnd = document.positionAt(document.getText().length);
			const range = new vscode.Range(positionBegin, positionEnd);
			edit.replace(document.uri, range, changedFile.fileData.content);

			if (changedFile.fileData.fsPath.endsWith(".fragment.xml")) {
				FileReader.setNewFragmentContentToCache(changedFile.fileData.content, changedFile.fileData.fsPath, true);
			} else if (changedFile.fileData.fsPath.endsWith(".view.xml")) {
				FileReader.setNewViewContentToCache(changedFile.fileData.content, changedFile.fileData.fsPath, true);
			} else if (changedFile.fileData.fsPath.endsWith("manifest.json")) {
				FileReader.rereadAllManifests();
			}
		}

		changedFiles.forEach(changedFile => {
			if (changedFile.fileData.fsPath.endsWith(".js")) {
				const className = FileReader.getClassNameFromPath(changedFile.fileData.fsPath);
				if (className) {
					UIClassFactory.setNewCodeForClass(className, changedFile.fileData.content);
				}
			}
		});

		await vscode.workspace.applyEdit(edit);
		setTimeout(() => {
			const activeDocument = vscode.window.activeTextEditor?.document;
			if (activeDocument) {
				DiagnosticsRegistrator.updateDiagnosticCollection(activeDocument);
			}
		}, 100);

	}

	private static _handleFileRename(file: {
		oldUri: vscode.Uri;
		newUri: vscode.Uri;
	}, fileChanges = this._getFileChangeData()) {
		return FileRenameMediator.handleFileRename(file, fileChanges);
	}

	private static _getFileChangeData(): IFileChanges[] {
		return FileReader.getAllFilesInAllWorkspaces().map(fileData => {
			return {
				fileData,
				changed: false
			}
		});
	}

	//TODO: Move to js completion items
	public static synchronizeSAPUIDefineCompletionItems(completionItems: CustomCompletionItem[]) {
		let disposable = workspace.onDidCreateFiles(event => {
			event.files.forEach(file => {
				if (file.fsPath.endsWith(".js")) {
					WorkspaceCompletionItemFactory.synchronizeCreate(completionItems, file);
				}
			});
		});

		UI5Plugin.getInstance().addDisposable(disposable);

		disposable = workspace.onDidDeleteFiles(event => {
			event.files.forEach(file => {
				if (file.fsPath.endsWith(".js")) {
					WorkspaceCompletionItemFactory.synchronizeDelete(completionItems, file);
				}
			});
		});

		UI5Plugin.getInstance().addDisposable(disposable);

		disposable = workspace.onDidRenameFiles(event => {
			event.files.forEach(file => {
				if (file.newUri.fsPath.endsWith(".js")) {
					WorkspaceCompletionItemFactory.synchronizeCreate(completionItems, file.newUri);
					WorkspaceCompletionItemFactory.synchronizeDelete(completionItems, file.oldUri);
				}
			});
		});

		UI5Plugin.getInstance().addDisposable(disposable);
	}

	private static _handleFileCreate(uri: vscode.Uri) {
		const changedFileText = fs.readFileSync(uri.fsPath, "utf8");

		const thisFileIsEmpty = changedFileText.length === 0;

		if (thisFileIsEmpty) {
			this._insertCodeTemplate(uri);
		}
	}

	private static _insertCodeTemplate(uri: vscode.Uri) {
		const templateInserter = TemplateGeneratorFactory.createInstance(uri.fsPath);
		const textToInsert = templateInserter?.generateTemplate(uri);
		if (textToInsert) {
			fs.writeFileSync(uri.fsPath, textToInsert);
		}
	}

	private static _handleFolderRename(oldUri: vscode.Uri, newUri: vscode.Uri) {
		const fileChanges = this._getFileChangeData();
		const newFilePaths = glob.sync(newUri.fsPath.replace(/\//g, fileSeparator) + "/**/*{.js,.xml}");
		newFilePaths.forEach(filePath => {
			const newFileUri = vscode.Uri.file(filePath);
			const oldFileUri = vscode.Uri.file(
				filePath
					.replace(/\//g, fileSeparator)
					.replace(
						newUri.fsPath.replace(/\//g, fileSeparator),
						oldUri.fsPath.replace(/\//g, fileSeparator)
					)
			);

			this._handleFileRename({
				newUri: newFileUri,
				oldUri: oldFileUri
			}, fileChanges);
		});

		return fileChanges;
	}
}