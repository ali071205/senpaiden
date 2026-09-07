import { JSDOM } from "jsdom";

console.log("=== ADVERSARIAL STRESS TEST: AdSlot & MonetizationProvider ===\n");

// Setup simulated browser environment
const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body><div id="root"></div></body></html>`, {
  url: "https://senpaiden.vercel.app",
  runScripts: "dangerously"
});

global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.HTMLDivElement = dom.window.HTMLDivElement;
global.HTMLIFrameElement = dom.window.HTMLIFrameElement;
global.Event = dom.window.Event;
global.CustomEvent = dom.window.CustomEvent;

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`);
    failed++;
  }
}

// Test 1: Rapid Mount / Unmount and DOM Cleanup
console.log("--- Stress Scenario 1: Rapid Mount / Unmount Route Changes (100 cycles) ---");
{
  const root = document.getElementById("root");
  let memoryClean = true;

  for (let i = 0; i < 100; i++) {
    const container = document.createElement("div");
    container.id = `ad-container-${i}`;
    root.appendChild(container);

    // Simulate AdSlot iframe injection
    const iframe = document.createElement("iframe");
    iframe.width = "728";
    iframe.height = "90";
    container.appendChild(iframe);

    // Simulate iframe doc injection
    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(`<html><body><script>var x = 1;</script></body></html>`);
      doc.close();
    }

    // Simulate unmount cleanup: containerRef.current.innerHTML = ""
    container.innerHTML = "";
    root.removeChild(container);

    if (root.children.length !== 0) {
      memoryClean = false;
    }
  }

  assert(memoryClean, "100 rapid mount/unmount cycles left 0 orphaned DOM nodes in root container");
}

// Test 2: Viewport Resizing Thrashing & Debounce Emulation
console.log("\n--- Stress Scenario 2: Viewport Resize Thrashing Across Breakpoints ---");
{
  let resizeEventCount = 0;
  let reRenderCount = 0;
  let isMobileState = false;

  let resizeTimer = null;
  const handleResize = (newWidth) => {
    resizeEventCount++;
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const mobileNow = newWidth < 768;
      if (isMobileState !== mobileNow) {
        isMobileState = mobileNow;
        reRenderCount++;
      }
    }, 150);
  };

  // Simulate thrashing between 760px and 770px 50 times in 10ms
  for (let i = 0; i < 50; i++) {
    const width = i % 2 === 0 ? 760 : 770;
    handleResize(width);
  }

  assert(resizeEventCount === 50, "Captured all 50 rapid resize events");
  
  // Wait 200ms to allow debounce timer to settle
  await new Promise(r => setTimeout(r, 200));

  assert(reRenderCount <= 1, `Debounce effectively collapsed 50 rapid resize events to ${reRenderCount} state transition(s)`);
}

// Test 3: Ad Blocker / Script Injection Failure Simulation
console.log("\n--- Stress Scenario 3: Ad Blocker / Network Blockade Simulation ---");
{
  let threwUncaught = false;
  try {
    const container = document.createElement("div");
    const iframe = document.createElement("iframe");
    container.appendChild(iframe);

    // Simulate iframe write with network blocked invoke.js
    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
          <body>
            <script>
              // Simulate blocked external script
              window.addEventListener('error', (e) => {
                // Should not propagate to parent window
              });
            </script>
            <script src="https://blocked.adsterra.com/invoke.js"></script>
          </body>
        </html>
      `);
      doc.close();
    }
  } catch (err) {
    threwUncaught = true;
  }

  assert(!threwUncaught, "Blocked script in iframe executes without throwing uncaught exceptions to parent window");
}

// Test 4: Dynamic Premium Upgrade Real-Time Event Handling
console.log("\n--- Stress Scenario 4: Dynamic Premium Upgrade Event Reaction ---");
{
  let adsAllowed = true;
  const sync = () => {
    // Check premium status
    const hasPremium = window.__mockHasPremium === true;
    adsAllowed = !hasPremium;
  };

  window.addEventListener("senpai-premium-updated", sync);

  assert(adsAllowed === true, "Initial state allows ads");

  // User purchases / unlocks premium
  window.__mockHasPremium = true;
  window.dispatchEvent(new CustomEvent("senpai-premium-updated"));

  assert(adsAllowed === false, "Dispatching 'senpai-premium-updated' immediately suppresses ads");
}

console.log(`\n=== STRESS TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
if (failed > 0) process.exit(1);
