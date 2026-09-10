import { ChangeDetectorRef, Component, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import {
  CleanupSession,
  LIMITS,
  assertSize,
  diffData,
  formulaCount,
  parseData,
  serializeData,
  type DataFormat,
  type Difference,
  type Operation,
  type ParseResult,
} from "../lib/data";

@Component({
  standalone: true,
  imports: [FormsModule],
  templateUrl: "./data.html",
})
export class DataBench {
  private readonly changeDetector = inject(ChangeDetectorRef);
  format: DataFormat = "csv";
  source = "";
  comparison = "";
  parsed?: ParseResult;
  compared?: ParseResult;
  session?: CleanupSession;
  externalDiff?: Difference;
  totalDiff?: Difference;
  operation: Operation = "trim";
  header = true;
  column: number | null = null;
  reading = false;
  error = "";
  status = "";
  allowFormulas = false;
  output = "";
  risks = 0;
  readonly operations: { value: Operation; label: string; detail: string }[] = [
    {
      value: "trim",
      label: "Trim outer whitespace",
      detail:
        "Remove leading and trailing whitespace from selected string values.",
    },
    {
      value: "spaces",
      label: "Collapse spaces / tabs",
      detail:
        "Replace runs of spaces or tabs with one space. Preserve line breaks.",
    },
    {
      value: "lower",
      label: "Lowercase strings",
      detail:
        "Use mechanical Unicode lowercase. Never change JSON keys or non-string values.",
    },
    {
      value: "upper",
      label: "Uppercase strings",
      detail:
        "Use mechanical Unicode uppercase. This can expand some characters.",
    },
    {
      value: "newlines",
      label: "Normalize string line breaks",
      detail:
        "Change CRLF / CR within string values to LF, not CSV record separators.",
    },
    {
      value: "guard",
      label: "Prefix formula-like CSV cells",
      detail:
        "Add an apostrophe to formula-like selected cells. This changes values; review before applying. Include the header and all columns to guard the entire file.",
    },
  ];
  get availableOperations() {
    return this.operations.filter(
      (item) => this.format === "csv" || item.value !== "guard",
    );
  }
  get operationDetail() {
    return this.operations.find((item) => item.value === this.operation)
      ?.detail;
  }
  get rows(): string[][] {
    return this.session?.current.format === "csv"
      ? this.session.current.rows
      : (this.parsed?.previewRows ?? []);
  }
  get columns(): string[] {
    return this.session?.current.format === "csv"
      ? this.session.current.rows[0]
      : [];
  }
  get displayDiff(): Difference | undefined {
    return this.session?.pending?.diff ?? this.totalDiff;
  }
  get documentSummary(): string {
    const doc = this.session?.current;
    if (!doc) return "";
    return doc.format === "csv"
      ? `${doc.rows.length} records / ${doc.rows[0].length} columns / no records removed`
      : "JSON structure, key order and number tokens retained";
  }
  draftChanged(): void {
    this.parsed = undefined;
    this.error = "";
    this.status = "";
  }
  changeFormat(): void {
    this.draftChanged();
    this.operation = "trim";
  }
  settingsChanged(): void {
    if (this.session) this.session.pending = undefined;
    this.status = "";
    this.error = "";
  }
  comparisonChanged(): void {
    this.compared = undefined;
    this.externalDiff = undefined;
    this.error = "";
  }

  updateDraft(event: Event, target: "source" | "comparison"): void {
    const input = event.target as HTMLTextAreaElement;
    try {
      assertSize(input.value);
      if (target === "source") {
        this.source = input.value;
        this.draftChanged();
      } else {
        this.comparison = input.value;
        this.comparisonChanged();
      }
    } catch {
      input.value = target === "source" ? this.source : this.comparison;
      this.error =
        "Text exceeds 256 KiB. This edit was rejected; the previous input is retained.";
    }
  }
  checkPaste(event: ClipboardEvent): void {
    const input = event.target as HTMLTextAreaElement;
    const pasted = event.clipboardData?.getData("text/plain") ?? "";
    try {
      assertSize(pasted);
      assertSize(
        input.value.slice(0, input.selectionStart) +
          pasted +
          input.value.slice(input.selectionEnd),
      );
    } catch {
      event.preventDefault();
      this.error =
        "Pasted text exceeds 256 KiB. Nothing was pasted; split the input into smaller files.";
    }
  }

  async readFile(event: Event, target: "source" | "comparison"): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.error = "";
    this.reading = true;
    try {
      if (file.size > LIMITS.bytes)
        throw new Error(
          "File exceeds 256 KiB. The existing input was not replaced.",
        );
      const text = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(await file.arrayBuffer());
      if (target === "source") {
        this.source = text;
        this.draftChanged();
      } else {
        this.comparison = text;
        this.comparisonChanged();
      }
      this.status =
        "UTF-8 file read locally. Preview it before making changes.";
    } catch (error) {
      this.error =
        error instanceof TypeError
          ? "This file is not valid UTF-8. Re-export it as UTF-8; the existing input was not replaced."
          : (error as Error).message;
    } finally {
      this.reading = false;
      input.value = "";
      this.changeDetector.markForCheck();
    }
  }
  sample(): void {
    this.source =
      this.format === "csv"
        ? 'name,team,note\r\n"  Ada Example  ","  Design  ","Line one\nLine two"\r\n"  Tayo Sample  ","  Research  ","SYNTHETIC fixture"\r\n'
        : '{"name":"  Ada Example  ","id":900719925474099312345,"active":true,"tags":["  Research  ","SYNTHETIC fixture"],"notes":null}';
    this.draftChanged();
  }
  previewSource(): void {
    this.error = "";
    this.parsed = parseData(this.source, this.format);
    if (this.parsed.document) {
      this.session = new CleanupSession(this.parsed.document);
      this.refresh();
      this.status =
        "Input validated. Original is retained in memory; choose and preview a transformation.";
    } else
      this.status =
        "Input needs correction. No cleanup session or download was created.";
  }
  previewTransformation(): void {
    this.error = "";
    try {
      this.session?.preview({
        operation: this.operation,
        header: this.header,
        column: this.column,
      });
      this.status = this.session?.pending?.diff.changes.length
        ? "Preview only. Review the changed values below, then apply."
        : "No values would change. Nothing added to history.";
    } catch (error) {
      this.error = (error as Error).message;
    }
  }
  apply(): void {
    this.error = "";
    try {
      if (this.session?.apply()) {
        this.refresh();
        this.status =
          "Transformation applied. Undo is available; original remains unchanged.";
      }
    } catch (error) {
      this.error = (error as Error).message;
    }
  }
  undo(): void {
    this.session?.undo();
    this.refresh();
    this.status = "Last transformation undone.";
  }
  reset(): void {
    this.session?.reset();
    this.refresh();
    this.status = "All transformations reset to the original parsed values.";
  }
  private refresh(): void {
    if (!this.session) return;
    this.output = serializeData(this.session.current);
    this.risks = formulaCount(this.session.current);
    this.totalDiff = diffData(this.session.original, this.session.current);
    this.allowFormulas = false;
    this.externalDiff = undefined;
    this.compared = undefined;
    this.error = "";
  }
  editSource(): void {
    if (
      this.session?.history.length &&
      !window.confirm(
        "Discard the applied changes and return to your original source? Download the result first if you need it.",
      )
    )
      return;
    this.session = undefined;
    this.parsed = undefined;
    this.output = "";
    this.totalDiff = undefined;
    this.externalDiff = undefined;
    this.compared = undefined;
    this.allowFormulas = false;
    this.column = null;
    this.error = "";
    this.status = "Original source restored for editing.";
  }
  clear(): void {
    if (
      (this.source || this.comparison) &&
      !window.confirm(
        "Clear both inputs, results and undo history from this page? Downloads already saved are not deleted.",
      )
    )
      return;
    this.session = undefined;
    this.parsed = undefined;
    this.compared = undefined;
    this.source = "";
    this.comparison = "";
    this.output = "";
    this.externalDiff = undefined;
    this.totalDiff = undefined;
    this.column = null;
    this.risks = 0;
    this.allowFormulas = false;
    this.error = "";
    this.status = "Workspace cleared.";
  }
  compare(): void {
    this.externalDiff = undefined;
    this.error = "";
    if (!this.session) return;
    this.compared = parseData(this.comparison, this.format);
    if (!this.compared.document) return;
    try {
      this.externalDiff = diffData(
        this.session.current,
        this.compared.document,
      );
      this.status = "Comparison complete. Neither document was modified.";
    } catch (error) {
      this.error = (error as Error).message;
    }
  }
  download(): void {
    if (!this.session || (this.risks && !this.allowFormulas)) return;
    this.save(
      this.output,
      `smallwork-cleaned.${this.format}`,
      this.format === "csv"
        ? "text/csv;charset=utf-8"
        : "application/json;charset=utf-8",
    );
  }
  downloadDiff(): void {
    if (!this.externalDiff) return;
    this.save(
      JSON.stringify(
        {
          format: this.format,
          direction: "current result -> comparison input",
          semantics:
            this.format === "csv"
              ? "Record/column positions, all records included; no key matching."
              : "JSON Pointer paths; array positions; object order ignored; number tokens compared exactly. Added/removed subtrees count once.",
          ...this.externalDiff,
        },
        null,
        2,
      ),
      "smallwork-diff.json",
      "application/json;charset=utf-8",
    );
  }
  downloadChangeReview(): void {
    if (!this.session || !this.displayDiff) return;
    this.save(
      JSON.stringify(
        {
          format: this.format,
          direction: this.session.pending
            ? "current -> proposed step (not applied)"
            : "original -> current",
          ...(this.session.pending
            ? {
                operation: this.operation,
                protectFirstRecord: this.format === "csv" && this.header,
                column: this.column === null ? "all" : this.column + 1,
              }
            : {}),
          ...this.displayDiff,
        },
        null,
        2,
      ),
      "smallwork-change-review.json",
      "application/json;charset=utf-8",
    );
  }
  private save(text: string, filename: string, mime: string): void {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.status =
      "Download requested. It contains your data; store it privately.";
  }
  short(value: string | undefined): string {
    if (value === undefined) return "(absent)";
    const visible = this.format === "json" ? value : JSON.stringify(value);
    return visible.length > 180
      ? visible.slice(0, 180) + "... [truncated]"
      : visible;
  }
}
