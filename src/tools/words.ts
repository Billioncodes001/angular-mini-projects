import { Component } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { formatWords, wordCount, type Format } from "../lib/tools";
@Component({
  standalone: true,
  imports: [FormsModule],
  template: `
    <p class="eyebrow">03 / THE WORD STUDIO</p>
    <h2>Give your words a polish.</h2>
    <p class="description">
      Tidy the spacing. Set the tone. Make a small edit that makes a big
      difference.
    </p>
    <label for="source">Your text</label
    ><textarea
      id="source"
      [(ngModel)]="source"
      maxlength="50000"
      rows="7"
      placeholder="A few words worth refining..."
    ></textarea>
    <div class="text-stats">
      <span>{{ count(source) }} words</span
      ><span>{{ source.length }} UTF-16 units</span
      ><span
        >{{
          source
            ? source.split(
                "
"
              ).length
            : 0
        }}
        lines</span
      >
    </div>
    <fieldset>
      <legend>Choose a finish</legend>
      <div class="formats">
        @for (option of options; track option.value) {
          <button
            type="button"
            [class.selected]="mode === option.value"
            [attr.aria-pressed]="mode === option.value"
            (click)="mode = option.value"
          >
            {{ option.label }}
          </button>
        }
      </div>
    </fieldset>
    <label for="result">Formatted text</label
    ><textarea
      id="result"
      class="formatted"
      [value]="format(source, mode)"
      readonly
      rows="7"
    ></textarea>
    <p class="hint">
      Select the result to copy it. Formatting is a mechanical transformation,
      not a grammar checker. Your text is never uploaded.
    </p>
  `,
})
export class Words {
  source = "";
  mode: Format = "sentence";
  count = wordCount;
  format = formatWords;
  options: { value: Format; label: string }[] = [
    { value: "sentence", label: "Sentence case" },
    { value: "title", label: "Title Case" },
    { value: "upper", label: "UPPERCASE" },
    { value: "lower", label: "lowercase" },
    { value: "trim", label: "Tidy spacing" },
  ];
}
