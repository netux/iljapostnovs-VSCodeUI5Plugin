import * as fs from "fs";
import * as vscode from "vscode";
import * as glob from "glob";
import { SyntaxAnalyzer } from "../CustomLibMetadata/SyntaxAnalyzer";
const workspace = vscode.workspace;

export class FileReader {
	private static readonly manifests: UIManifest[] = [];
	private static readonly viewCache: LooseObject = {};
	private static readonly UI5Version: any = vscode.workspace.getConfiguration("ui5.plugin").get("ui5version");
	public static globalStoragePath: string | undefined;

	public static setNewViewContentToCache(viewContent: string) {
		const controllerName = this.getControllerNameFromView(viewContent);
		if (controllerName) {
			this.viewCache[controllerName] = viewContent;
		}
	}

	public static getDocumentTextFromCustomClassName(className: string, isFragment?: boolean) {
		let documentText;
		const classPath = this.getClassPath(className, isFragment);
		if (classPath) {
			documentText = fs.readFileSync(classPath, "ascii");
		}

		return documentText;
	}

	public static getClassPath(className: string, isFragment?: boolean) {
		let classPath: string | undefined;
		const extension = isFragment ? ".fragment.xml" : ".js";
		const manifest = this.getManifestForClass(className);
		if (manifest) {
			classPath = manifest.fsPath + className.replace(manifest.componentName, "").replace(/\./g, "\\").trim() + extension;
			try {
				fs.readFileSync(classPath);
			} catch (error) {
				if (extension === ".js") {
					//thx to controllers for this
					classPath = classPath.replace(".js", ".controller.js");
					try {
						fs.readFileSync(classPath);
					} catch (error) {
						classPath = undefined;
					}
				}
			}
		}

		return classPath;
	}

	public static getAllManifests() {
		if (this.manifests.length === 0) {
			this.readAllWorkspaceManifests();
		}

		return this.manifests;
	}

	private static getManifestForClass(className: string) {
		let returnManifest:UIManifest | undefined;
		if (vscode.window.activeTextEditor) {
			if (this.manifests.length === 0) {
				this.readAllWorkspaceManifests();
			}

			returnManifest = this.manifests.find(UIManifest => className.indexOf(UIManifest.componentName) > -1);
		}

		return returnManifest;
	}

	private static readAllWorkspaceManifests() {
		const wsFolders = workspace.workspaceFolders || [];
		for (const wsFolder of wsFolders) {
			const manifests = this.getManifestsInWorkspaceFolder(wsFolder);
			for (const manifest of manifests) {
				const UI5Manifest:any = JSON.parse(fs.readFileSync(manifest.fsPath, "ascii"));
				const manifestFsPath:string = manifest.fsPath.replace("\\manifest.json", "");
				const UIManifest = {
					componentName: UI5Manifest["sap.app"].id,
					fsPath: manifestFsPath,
					content: UI5Manifest
				};
				this.manifests.push(UIManifest);
			}
		}
	}

	public static getManifestsInWorkspaceFolder(wsFolder: vscode.WorkspaceFolder) {
		const src = vscode.workspace.getConfiguration("ui5.plugin").get("src");
		const manifestPaths = glob.sync(wsFolder.uri.fsPath.replace(/\\/g, "/") + "/" + src + "/manifest.json");
		const manifests: manifestPaths[] = manifestPaths.map(manifestPath => {
			return {
				fsPath: manifestPath.replace(/\//g, "\\")
			};
		});
		return manifests;
	}


	public static getClassNameFromView(controllerClassName: string, controlId: string) {
		let className: string | undefined;
		const documentText = this.getViewText(controllerClassName);
		if (documentText) {
			className = this.getClassOfControlIdFromView(documentText, controlId);
		}

		return className;
	}

	public static getViewText(controllerName: string) {
		let viewText: string | undefined;
		if (this.viewCache[controllerName]) {
			viewText = this.viewCache[controllerName];
		} else {
			this.readAllViewsAndSaveInCache();
			viewText = this.viewCache[controllerName];
		}

		return viewText;
	}

	private static getClassOfControlIdFromView(documentText: string, controlId: string) {
		let controlClass = "";
		//TODO: move to XMLParser
		const controlResults = new RegExp(`(?=id="${controlId}")`).exec(documentText);
		if (controlResults) {
			let beginIndex = controlResults.index;
			while (beginIndex > 0 && documentText[beginIndex] !== "<") {
				beginIndex--;
			}
			beginIndex++;

			let endIndex = beginIndex;
			while (endIndex < documentText.length && !this.isSeparator(documentText[endIndex])) {
				endIndex++;
			}

			let regExpBase;
			const classTag = documentText.substring(beginIndex, endIndex);
			const classTagParts = classTag.split(":");
			let className;
			if (classTagParts.length === 1) {
				regExpBase = `(?<=xmlns=").*(?=")`;
				className = classTagParts[0];
			} else {
				regExpBase = `(?<=xmlns(:${classTagParts[0]})=").*(?=")`;
				className = classTagParts[1];
			}
			const rClassName = new RegExp(regExpBase);
			const classNameResult = rClassName.exec(documentText);
			if (classNameResult) {
				controlClass = [classNameResult[0], className.trim()].join(".");
			}
		}
		return controlClass;
	}

	private static readAllViewsAndSaveInCache() {
		const wsFolders = workspace.workspaceFolders || [];
		const src = vscode.workspace.getConfiguration("ui5.plugin").get("src");
		for (const wsFolder of wsFolders) {
			const viewPaths = glob.sync(wsFolder.uri.fsPath.replace(/\\/g, "/") + "/" + src + "/**/*/*.view.xml");
			viewPaths.forEach(viewPath => {
				let viewContent = fs.readFileSync(viewPath, "ascii");
				viewContent = this.replaceFragments(viewContent);
				const controllerName = this.getControllerNameFromView(viewContent);
				if (controllerName) {
					this.viewCache[controllerName] = viewContent;
				}
			});
		}
	}

	static getControllerNameFromView(viewContent: string) {
		const controllerNameResult = /(?<=controllerName=").*(?=")/.exec(viewContent);

		return controllerNameResult ? controllerNameResult[0] : undefined;
	}

	public static replaceFragments(documentText: string) {
		const fragments = this.getFragments(documentText);
		fragments.forEach(fragment => {
			const fragmentName = this.getFragmentName(fragment);
			if (fragmentName) {
				const fragmentText = this.getDocumentTextFromCustomClassName(fragmentName, true);
				if (fragmentText) {
					documentText = documentText.replace(fragment, fragmentText);
				}
			}
		});

		return documentText;
	}

	private static getFragmentName(fragmentText: string) {
		let fragmentName;
		const fragmentNameResult = /(?<=fragmentName=").*?(?=")/.exec(fragmentText);
		if (fragmentNameResult) {
			fragmentName = fragmentNameResult[0];
		}
		return fragmentName;
	}

	private static getFragments(documentText: string) {
		return documentText.match(/\<.*?Fragment(.|\s)*?\/>/g) || [];
	}

	private static isSeparator(char: string) {
		return char === " " || char === "	" || char === ";" || char === "\n" || char === "\t" || char === "\r";
	}

	public static getClassNameFromPath(fsPath: string) {
		let className: string | undefined;
		const manifests = this.getAllManifests();
		const currentManifest = manifests.find(manifest => fsPath.indexOf(manifest.fsPath) > -1);
		if (currentManifest) {
			className = fsPath.replace(currentManifest.fsPath, currentManifest.componentName).replace(".controller", "").replace(".js","").replace(/\\/g, ".");
		}

		return className;
	}

	static getCache(cacheType: FileReader.CacheType) {
		let cache;
		const cachePath =
			cacheType === FileReader.CacheType.Metadata ? this.getMetadataCachePath() :
			cacheType === FileReader.CacheType.APIIndex ? this.getAPIIndexCachePath() :
			cacheType === FileReader.CacheType.Icons ? this.getIconCachePath() :
			null;

		if (cachePath && fs.existsSync(cachePath)) {
			cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
		}

		return cache;
	}

	static setCache(cacheType: FileReader.CacheType, cache: string) {
		const cachePath =
			cacheType === FileReader.CacheType.Metadata ? this.getMetadataCachePath() :
			cacheType === FileReader.CacheType.APIIndex ? this.getAPIIndexCachePath() :
			cacheType === FileReader.CacheType.Icons ? this.getIconCachePath() :
			null;

		if (cachePath) {
			if (!fs.existsSync(cachePath)) {
				this.ensureThatPluginCacheFolderExists();
			}

			fs.writeFileSync(cachePath, cache, "utf8");
		}
	}

	static clearCache() {
		if (this.globalStoragePath) {
			if (fs.existsSync(this.globalStoragePath)) {
				const path = require("path");
				const directory = this.globalStoragePath;
				fs.readdir(directory, (err, files) => {
					for (const file of files) {
						fs.unlinkSync(path.join(directory, file));
					}
				});
			}
		}
	}

	private static ensureThatPluginCacheFolderExists() {
		if (this.globalStoragePath) {
			if (!fs.existsSync(this.globalStoragePath)) {
				fs.mkdirSync(this.globalStoragePath);
			}
		}
	}

	private static getMetadataCachePath() {
		return `${this.globalStoragePath}\\cache_${this.UI5Version}.json`;
	}

	private static getAPIIndexCachePath() {
		return `${this.globalStoragePath}\\cache_appindex_${this.UI5Version}.json`;
	}

	private static getIconCachePath() {
		return `${this.globalStoragePath}\\cache_icons_${this.UI5Version}.json`;
	}

	public static getResourceModelFiles() {
		const manifests = this.getAllManifests();
		return manifests.map(manifest => {
			return {
				content: this.readResourceModelFile(manifest),
				componentName: manifest.componentName
			};
		});
	}

	public static readResourceModelFile(manifest: UIManifest) {
		let resourceModelFileContent = "";
		const resourceModelFilePath = this.getResourceModelUriForManifest(manifest);
		try {
			resourceModelFileContent = fs.readFileSync(resourceModelFilePath, "ascii");
		} catch {
			resourceModelFileContent = "";
		}

		return resourceModelFileContent;
	}

	public static getResourceModelUriForManifest(manifest: UIManifest) {
		const i18nRelativePath = manifest.content["sap.app"].i18n || "i18n\\i18n.properties";
		const i18nPath = i18nRelativePath.replace(/\//g, "\\");
		return `${manifest.fsPath}\\${i18nPath}`;
	}

	public static getComponentNameOfAppInCurrentWorkspaceFolder() {
		return this.getCurrentWorkspaceFoldersManifest()?.componentName;
	}

	public static getCurrentWorkspaceFoldersManifest() {
		const currentClassName = SyntaxAnalyzer.getCurrentClassName();
		if (currentClassName) {
			return this.getManifestForClass(currentClassName);
		}
	}
}

export module FileReader {
	export enum CacheType {
		Metadata = "1",
		APIIndex = "2",
		Icons = "3"
	}
}

interface UIManifest {
	fsPath: string;
	componentName: string;
	content: any;
}

interface manifestPaths {
	fsPath: string;
}

interface LooseObject {
	[key: string]: any;
}