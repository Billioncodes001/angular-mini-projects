import { Component } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import {
  provideRouter,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from "@angular/router";

@Component({
  selector: "app-root",
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="shell">
      <header>
        <a class="brand" routerLink="/">Smallwork<span>/</span></a
        ><span class="edition">A COLLECTION OF USEFUL LITTLE THINGS</span
        ><span class="badge">Angular / 21</span>
      </header>
      <main>
        <section class="intro">
          <p class="eyebrow">SMALL TOOLS. SURPRISINGLY USEFUL.</p>
          <h1>Less friction. <em>More flow.</em></h1>
          <p>
            A thoughtful little toolkit for numbers, words and curious minds.
            Everything happens on your device.
          </p>
        </section>
        <div class="workbench">
          <nav aria-label="Tools">
            <a routerLink="/calculator" routerLinkActive="active"
              ><span>01</span> Calculator <b>+</b></a
            ><a routerLink="/cipher" routerLinkActive="active"
              ><span>02</span> Caesar cipher <b>↔</b></a
            ><a routerLink="/words" routerLinkActive="active"
              ><span>03</span> Word studio <b>Aa</b></a
            >
            <p>No accounts.<br />No tracking.<br />Just useful tools.</p>
          </nav>
          <div class="tool"><router-outlet /></div>
        </div>
      </main>
      <footer>
        <span>Built by Billioncodes</span
        ><span>Made for the small things that matter.</span>
      </footer>
    </div>
  `,
})
class App {}

bootstrapApplication(App, {
  providers: [
    provideRouter([
      {
        path: "calculator",
        loadComponent: () =>
          import("./tools/calculator").then((m) => m.Calculator),
      },
      {
        path: "cipher",
        loadComponent: () => import("./tools/cipher").then((m) => m.Cipher),
      },
      {
        path: "words",
        loadComponent: () => import("./tools/words").then((m) => m.Words),
      },
      { path: "", redirectTo: "calculator", pathMatch: "full" },
      { path: "**", redirectTo: "calculator" },
    ]),
  ],
}).catch(console.error);
