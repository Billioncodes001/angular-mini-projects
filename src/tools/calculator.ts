import { Component } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { calculate } from "../lib/tools";

@Component({
  standalone: true,
  imports: [FormsModule],
  template: `
    <p class="eyebrow">01 / THE NUMBERS DESK</p>
    <h2>Work it out.</h2>
    <p class="description">
      From quick sums to nested expressions. A little clarity in every
      calculation.
    </p>
    <form (ngSubmit)="solve()">
      <label for="expression">Your expression</label
      ><input
        id="expression"
        name="expression"
        [(ngModel)]="expression"
        maxlength="512"
        placeholder="(24 + 18) * 2"
        autocomplete="off"
      />
      <div class="keypad">
        @for (key of keys; track key) {
          <button
            type="button"
            class="key"
            (click)="append(key)"
            [attr.aria-label]="'Insert ' + key"
          >
            {{ key }}
          </button>
        }
        <button type="button" class="key quiet" (click)="clear()">Clear</button
        ><button
          type="button"
          class="key quiet"
          (click)="expression = expression.slice(0, -1)"
        >
          Backspace
        </button>
      </div>
      <button class="primary" type="submit">Calculate <span>=</span></button>
    </form>
    @if (error) {
      <p class="error" role="alert">{{ error }}</p>
    }
    <div class="result" aria-live="polite">
      <span>THE RESULT</span
      ><output>{{ result ?? "Ready when you are." }}</output>
    </div>
    <p class="hint">
      Supports +, -, *, /, ^ and parentheses. Uses floating-point arithmetic,
      not financial precision.
    </p>
    @if (history.length) {
      <div class="history">
        <h3>Recent calculations</h3>
        @for (entry of history; track $index) {
          <p>
            <span>{{ entry.expression }}</span
            ><strong>{{ entry.result }}</strong>
          </p>
        }
      </div>
    }
  `,
})
export class Calculator {
  expression = "";
  result: number | null = null;
  error = "";
  history: { expression: string; result: number }[] = [];
  keys = [
    "7",
    "8",
    "9",
    "/",
    "4",
    "5",
    "6",
    "*",
    "1",
    "2",
    "3",
    "-",
    "0",
    ".",
    "(",
    ")",
    "+",
    "^",
  ];
  append(key: string) {
    if (this.expression.length < 512) this.expression += key;
  }
  clear() {
    this.expression = "";
    this.result = null;
    this.error = "";
  }
  solve() {
    try {
      this.result = calculate(this.expression);
      this.error = "";
      this.history = [
        { expression: this.expression, result: this.result },
        ...this.history,
      ].slice(0, 5);
    } catch (error) {
      this.result = null;
      this.error =
        error instanceof Error ? error.message : "Check your expression.";
    }
  }
}
