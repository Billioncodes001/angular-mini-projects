import { Component } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { caesar } from "../lib/tools";
@Component({
  standalone: true,
  imports: [FormsModule],
  template: `
    <p class="eyebrow">02 / A LITTLE MYSTERY</p>
    <h2>Shift your perspective.</h2>
    <p class="description">
      Explore a classic letter-shifting cipher. A playful lesson in
      substitution, not secure encryption.
    </p>
    <form (ngSubmit)="transform()">
      <label for="message">Your message</label
      ><textarea
        id="message"
        name="message"
        [(ngModel)]="message"
        maxlength="10000"
        rows="5"
        placeholder="Meet me at the library."
      ></textarea>
      <div class="row">
        <div>
          <label for="shift">Shift</label
          ><input
            id="shift"
            name="shift"
            type="number"
            [(ngModel)]="shift"
            min="-100000"
            max="100000"
            step="1"
            required
          />
        </div>
        <div>
          <label for="direction">Direction</label
          ><select id="direction" name="direction" [(ngModel)]="direction">
            <option value="encode">Encode</option>
            <option value="decode">Decode</option>
          </select>
        </div>
      </div>
      <button class="primary">Transform message <span>↔</span></button>
    </form>
    @if (error) {
      <p class="error" role="alert">{{ error }}</p>
    }
    <div class="result" aria-live="polite">
      <span>YOUR TRANSFORMED MESSAGE</span
      ><output class="text-result">{{
        result || "Your transformed message will appear here."
      }}</output>
    </div>
    <p class="hint">
      Only A-Z letters shift. Punctuation, numbers, accents and emoji stay
      exactly where they are. Use the same shift to decode.
    </p>
  `,
})
export class Cipher {
  message = "";
  shift = 3;
  direction = "encode";
  result = "";
  error = "";
  transform() {
    try {
      this.result = caesar(
        this.message,
        this.direction === "decode" ? -this.shift : this.shift,
      );
      this.error = "";
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Invalid shift.";
      this.result = "";
    }
  }
}
