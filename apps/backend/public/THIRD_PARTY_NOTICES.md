# SPICE Local Runtime Third-Party Notices

The SPICE local runtime includes `ffmpeg-static` and a platform-specific FFmpeg binary so user-requested audio downloads can be converted to MP3 on the user's own machine.

| Component | Version | License | Source |
| --- | --- | --- | --- |
| ffmpeg-static | 5.3.0 | GPL-3.0-or-later | https://github.com/eugeneware/ffmpeg-static |
| FFmpeg | Platform build selected by ffmpeg-static | GPL-3.0 for the bundled builds | https://ffmpeg.org/download.html#get-sources |
| LAME MP3 encoder | Included in the FFmpeg build | LGPL-2.0 | https://lame.sourceforge.io/ |

The runtime package keeps the binary's accompanying `ffmpeg.LICENSE` / `ffmpeg.exe.LICENSE` and `ffmpeg.README` / `ffmpeg.exe.README` files. Those files identify the exact build, license, configuration, and corresponding FFmpeg source revision distributed with that runtime.

SPICE is not affiliated with or endorsed by FFmpeg, LAME, or ffmpeg-static.

## Web interface

| Component | License | Source |
| --- | --- | --- |
| Musializer (visualizer analysis, layout, and circle shader, ported to TypeScript/WebGL in `app/musializer`) | MIT | https://github.com/tsoding/musializer |
| Pixelify Sans (font of the "C# guy" surface) | SIL Open Font License 1.1 | https://fonts.google.com/specimen/Pixelify+Sans |
| Press Start 2P (display font of the "C# guy" surface) | SIL Open Font License 1.1 | https://fonts.google.com/specimen/Press+Start+2P |

The wallpaper of the "C# guy" surface (`public/themes/csharp-guy/negev.webp`) is fan art supplied by the project owner; all rights remain with its original artist.

Musializer license:

```
Copyright 2023 Alexey Kutepov <reximkut@gmail.com> and Musializer Contributors

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```
