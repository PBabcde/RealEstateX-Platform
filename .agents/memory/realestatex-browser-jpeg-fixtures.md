---
name: RealEstateX browser JPEG fixtures
description: Ensure photo-upload test images are decodable by the browser itself.
---

Browser photo-upload JPEG fixtures must be validated with Chromium decoding, not only by checking that an image utility recognizes the file.

**Why:** A compact JPEG fixture can be accepted by ImageMagick but rejected by Chromium’s image decoder, causing browser recovery tests to fail before reaching the behavior they intend to cover.

**How to apply:** When adding or changing browser photo-upload tests, verify that the exact fixture decodes in Chromium before using it to test upload behavior.
