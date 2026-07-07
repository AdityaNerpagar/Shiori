# Companion art — generation prompts

Prompts for generating the companion avatars with Gemini's image model.
One character per chat session: generate the **portrait first**, then in
the *same conversation* ask for "same exact character, same art style —
now full body" plus the full-body prompt. Prepend the STYLE BLOCK to
every prompt — it is what makes six separate generations read as one cast.

**Sizes.** Portrait: square 1:1, face filling ~70% of the frame (the UI
crops these small). Full body: 2:3 or 9:16 tall.

**Files.** Save into `public/personas/`:

| Companion | Portrait | Full body |
|---|---|---|
| Shiori | `shiori.png` | `shiori-full.png` |
| Yuki | `yuki.png` | `yuki-full.png` |
| Rei | `rei.png` | `rei-full.png` |
| Kai | `kai.png` | `kai-full.png` |
| Mira | `mira.png` | `mira-full.png` |
| Haru | `haru.png` | `haru-full.png` |

**If the face drifts** between portrait and full body: regenerate the
full body (keep the portrait), repeating "identical face to the previous
image". If Mira over-sexualizes, add "modest, elegant fashion editorial
style" — she works through attitude, not skin.

---

## STYLE BLOCK (prepend to every prompt)

> Anime illustration, elegant semi-realistic anime style, clean line art,
> soft cel shading, cinematic warm rim lighting. Single adult character
> in their twenties. Setting: a quiet night room, background a deep dark
> navy-ink (#0c101a), near-black, softly vignetted. The only light source
> is a warm amber reading lamp glow (#e5a44a) from the upper side, giving
> warm paper-cream (#ece7da) highlights on skin and hair edges. Cozy,
> intimate, late-night library mood. Muted refined palette, high detail
> on face and hair, no text, no watermark, no logo, no border.

The hex values are the app's own palette (`--ink`, `--lamp`, `--paper`
in `app/globals.css`), so the art sits seamlessly on the UI.

---

## Shiori — the gentle bookkeeper (default)

**Portrait.** A gentle young woman with long, straight ink-black hair
with a soft blue sheen, side-parted, one lock tucked behind her ear.
Warm brown eyes, calm and kind, with a faint knowing smile. She wears a
cream knitted cardigan over a white collared blouse. A thin amber ribbon
bookmark is woven into her hair like a hairband, its ends trailing.
Three-quarter view, bust framing, looking at the viewer as if she just
glanced up from a book.

**Full body.** Same character, standing turned slightly away but looking
back at the viewer, holding a thick open hardcover book in one arm, her
other hand marking a page with the amber ribbon. Long pleated warm-grey
skirt, soft indoor slippers. Beside her, the suggestion of a tall
bookshelf fading into the dark. Serene, unhurried posture.

## Yuki — sunny & bubbly

**Portrait.** A bright, cheerful young woman with shoulder-length
honey-blonde hair in loose waves, two small strands tied with tiny
coral-red bows. Big sparkling amber eyes, wide open, joyful grin showing
teeth, faint blush. She wears an oversized coral-and-cream striped
sweater slipping off one shoulder over a white tee. Leaning slightly
into the frame like she's about to tell you something exciting. Bust
framing, front view, high energy.

**Full body.** Same character, mid-motion — bouncing on her toes, one
hand thrown up in excitement, the other hugging a big popcorn bucket to
her chest, a few kernels flying. Denim shorts over black leggings,
fluffy socks. Expression: absolutely delighted, mid-laugh. Motion lines
subtle, hair swinging.

## Rei — cool & composed

**Portrait.** A composed, striking young woman with a sleek silver-ash
asymmetric bob, longer on one side, razor-straight. Sharp steel-blue
eyes (#37415c undertone), half-lidded, unimpressed but attentive.
Minimal expression — the faintest hint of a smirk at one corner. She
wears a high-collared charcoal turtleneck under a structured dark coat.
Profile turned away, eyes cut toward the viewer. Cool blue rim light on
one side contrasting the warm lamp on the other.

**Full body.** Same character, standing perfectly straight with hands in
coat pockets, weight on one leg, looking over her shoulder at the
viewer. Long charcoal coat to the knees, slim dark trousers, minimalist
boots. A single steaming cup of black tea floats on a side table beside
her in the dark. Poised, economical, nothing wasted.

## Kai — laid-back & hype

**Portrait.** A relaxed, friendly young man with messy dark-teal hair
pushed back by habit, a few strands falling over his forehead. Warm
hazel eyes, easy lopsided grin, one eyebrow slightly raised. Wireless
headphones hang around his neck. He wears an open dark-green hoodie over
a faded band tee. Bust framing, leaning back slightly like he's sunk
into a couch, totally at ease.

**Full body.** Same character, sprawled sideways on a worn leather
couch, one leg over the armrest, a game controller resting loose in one
hand and a bag of chips beside him, gesturing toward the viewer with the
other hand mid-sentence — "okay so, real talk—". Sweatpants, mismatched
socks. The couch fades into the dark room; the lamp glow catches his grin.

## Mira — velvet & teasing

**Portrait.** An elegant, confident young woman with long deep-burgundy
wavy hair swept over one shoulder. Half-lidded amber-gold eyes with long
lashes, a slow knowing smirk — like she knows the ending and won't tell.
Small dark beauty mark under one eye. She wears a refined wine-red silk
blouse with a high neck and gold ear cuffs. Chin slightly lowered, eyes
up at the viewer. Tasteful, sophisticated, magnetic — elegance over
exposure.

**Full body.** Same character, seated sideways in a high-backed velvet
armchair, legs crossed, one elbow on the armrest with her cheek resting
against two fingers, a glass of red wine catching the lamplight in her
other hand. Long wine-red skirt with a modest slit, elegant heels. A
knowing, patient smile. The armchair half-swallowed by the dark.

## Haru — soft & earnest

**Portrait.** A gentle, soft-featured young man with fluffy light-brown
hair, slightly tousled. Large warm hazel-green eyes, open and sincere,
brows tilted in a kind, almost-moved expression — like a scene just got
to him. Soft shy smile. He wears a cream cable-knit sweater with a
rounded collar shirt underneath. Bust framing, slightly tilted head,
holding a mug of cocoa with both hands near his chest, steam rising.

**Full body.** Same character, sitting cross-legged on a floor cushion
wrapped in a beige blanket like a cape, hugging a pillow to his chest, a
box of tissues within reach — clearly ready to cry at the good parts and
not ashamed. Soft socks, mug of cocoa on the floor beside him, faint
happy tears at the corners of his eyes.
