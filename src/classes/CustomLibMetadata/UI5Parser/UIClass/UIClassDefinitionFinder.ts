import { SyntaxAnalyzer } from "../../SyntaxAnalyzer";
import * as vscode from "vscode";
import { UIClassFactory } from "./UIClassFactory";
import { CustomUIClass } from "./CustomUIClass";
import { FileReader } from "../../../Util/FileReader";
import LineColumn from 'line-column';
import { StandardUIClass } from "./StandardUIClass";
import { DifferentJobs } from "../../JSParser/DifferentJobs";
import { JSFunctionCall } from "../../JSParser/types/FunctionCall";
import { AbstractUIClass } from "./AbstractUIClass";
import { URLBuilder } from "../../../Util/URLBuilder";

export class UIClassDefinitionFinder {
	public static getPositionAndUriOfCurrentVariableDefinition(classNameDotNotation?: string, methodName?: string, openInBrowserIfStandardMethod?: boolean) : vscode.Location | undefined {
		let location: vscode.Location | undefined;
		const textEditor = vscode.window.activeTextEditor;
		if (textEditor) {
			if (!classNameDotNotation) {
				const document = textEditor.document;
				const position = textEditor.selection.start;
				methodName = document.getText(document.getWordRangeAtPosition(position));
				classNameDotNotation = this.getVariableClass();
			}
			if (classNameDotNotation && methodName) {
				if (classNameDotNotation.startsWith("sap.") && openInBrowserIfStandardMethod) {
					this.openClassMethodInTheBrowser(classNameDotNotation, methodName);
				} else {
					location = this.getVSCodeMethodLocation(classNameDotNotation, methodName);
					if (!location) {
						const UIClass = UIClassFactory.getUIClass(classNameDotNotation);
						if (UIClass.parentClassNameDotNotation) {
							location = this.getPositionAndUriOfCurrentVariableDefinition(UIClass.parentClassNameDotNotation, methodName, openInBrowserIfStandardMethod);
						}
					}
				}
			}
		}

		return location;
	}

	private static getVSCodeMethodLocation(classNameDotNotation: string, methodName: string) {
		let location: vscode.Location | undefined;
		const UIClass = UIClassFactory.getUIClass(classNameDotNotation);

		if (UIClass instanceof CustomUIClass && UIClass.classBody) {
			const currentMethod = UIClass.methods.find(method => method.name === methodName);
			if (currentMethod) {
				const classPath = FileReader.getClassPath(UIClass.className);
				if (classPath) {
					const classUri = vscode.Uri.file(classPath);
					if (currentMethod.position) {
						const position = LineColumn(UIClass.classText).fromIndex(currentMethod.position);
						if (position) {
							const methodPosition = new vscode.Position(position.line - 1, position.col - 1);
							location = new vscode.Location(classUri, methodPosition);
						}
					}
				}
			}

		}

		return location;
	}

	static getVariableClass(variable?: string) {
		let UIClassName: string | undefined;
		if (!variable) {
			variable = SyntaxAnalyzer.getCurrentVariable();
		}
		const textEditor = vscode.window.activeTextEditor;

		if (textEditor) {
			const document = textEditor.document;
			const currentPositionOffset = document.offsetAt(textEditor.selection.start);
			const currentClassName = SyntaxAnalyzer.getCurrentClassName();

			if (currentClassName) {
				const currentClass = UIClassFactory.getUIClass(currentClassName);
				UIClassName = SyntaxAnalyzer.getClassNameFromVariableParts(variable.split("."), currentClass, undefined, currentPositionOffset);
			}
		}

		return UIClassName;
	}

	private static openClassMethodInTheBrowser(classNameDotNotation: string, methodName: string) {
		const UIClass = UIClassFactory.getUIClass(classNameDotNotation);
		if (UIClass instanceof StandardUIClass) {
			const methodFromClass = UIClass.methods.find(method => method.name === methodName);
			if (methodFromClass) {
				if (methodFromClass.isFromParent) {
					this.openClassMethodInTheBrowser(UIClass.parentClassNameDotNotation, methodName);
				} else {
					const UIClass = UIClassFactory.getUIClass(classNameDotNotation);
					const linkToDocumentation = URLBuilder.getInstance().getUrlForMethodApi(UIClass, methodName);
					vscode.env.openExternal(vscode.Uri.parse(linkToDocumentation));
				}
			}
		}
	}

	public static getAdditionalJSTypesHierarchically(UIClass: AbstractUIClass) {
		if (UIClass instanceof CustomUIClass &&  UIClass.classBody) {
			const variables = DifferentJobs.getAllVariables(UIClass.classBody);
			variables.forEach(variable => {
				if (!variable.jsType && variable.parts.length > 0) {
					const allPartsAreFunctionCalls = !variable.parts.find(part => !(part instanceof JSFunctionCall));
					if (allPartsAreFunctionCalls) {
						//TODO: calls parsing twice.
						variable.jsType = SyntaxAnalyzer.getClassNameFromVariableParts(variable.parsedBody.split("."), UIClass, undefined, variable.positionEnd);
					}
				}
			});
		}
	}
}