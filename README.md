# HathiTrust Text Export Userscript

A Tampermonkey userscript for exporting text from HathiTrust **Text-only** pages into a `.txt` file.

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser.
2. Click the link below to install the script directly from Greasy Fork:

   **[HathiTrust Text Export UI + seq/num on Greasy Fork](https://greasyfork.org/en/scripts/571582-hathitrust-text-export-ui-seq-num)**

3. Click **Install** on the Greasy Fork page.
4. Open any HathiTrust text-only page matching:

   `https://babel.hathitrust.org/cgi/ssd*`

## Features

- Export text from HathiTrust `cgi/ssd` text-only pages
- Support both:
  - `num` mode: original book page number
  - `seq` mode: scan sequence number
- Start and end values can be entered from a small floating UI
- Default start/end values are based on the current page
- Export progress is shown on the button while processing
- Output is saved as a `.txt` file
- Keeps page title and body text only — no extra metadata

## Requirements

- Microsoft Edge or another modern Chromium-based browser
- [Tampermonkey](https://www.tampermonkey.net/)

## Usage

1. Open a HathiTrust text-only page.
2. Look for the floating export panel in the lower-right corner.
3. Choose the page mode:
   - `num` for printed/book page numbers
   - `seq` for scan sequence numbers
4. Enter:
   - `Start`
   - `End`
5. Click `Export TXT`.
6. Wait for the button text to show progress, e.g. `Exporting... num 87`.
7. Save the generated `.txt` file when prompted.

## How page modes work

### `num` mode
Use this when the page title contains a printed page number such as:
