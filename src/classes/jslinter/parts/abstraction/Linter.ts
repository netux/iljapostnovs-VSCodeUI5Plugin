import * as vscode from "vscode";
import { CustomDiagnosticType } from "../../../registrators/DiagnosticsRegistrator";

export interface Error {
	code: string;
	message: string;
	range: vscode.Range;
	acornNode: any;
	type?: CustomDiagnosticType;
	fieldName?: string;
	methodName?: string;
	sourceClassName?: string;
	isController?: boolean;
}
export abstract class Linter {
	abstract getErrors(document: vscode.TextDocument) : Error[];
}