# Reference Web Apps

> This document is for both humans and AI.
>
> **Humans:** Study these apps and codebases to understand what good looks like.
> Visit the links, use the products, read the code.
>
> **AI:** You cannot visit these links. Instead, read the "What to take from this"
> sections carefully — they describe the specific principles and patterns to apply
> when building UI or reviewing code in this project.

---

## Table of Contents

1. [Why This Document Exists](#1-why-this-document-exists)
2. [What AI-Generated UI Looks Like (And Why to Avoid It)](#2-what-ai-generated-ui-looks-like-and-why-to-avoid-it)
3. [UI Design References](#3-ui-design-references)
4. [Open Source Code References](#4-open-source-code-references)
5. [Design Principles to Apply](#5-design-principles-to-apply)

---

## 1. Why This Document Exists

AI tools default to the most statistically average output. In UI terms, that means:
every app looks the same, every layout is card-based, every color is a safe blue,
every font is Inter, every button has the same border radius.

This document gives AI specific examples to aim toward instead of averaging toward
the mean. It also gives human team members a shared vocabulary for what "good" looks
like so feedback is specific rather than subjective.

---

## 2. What AI-Generated UI Looks Like (And Why to Avoid It)

These are the specific patterns that make a UI look AI-generated. Avoid all of them.

### Visual Red Flags

| Pattern | Why It Looks AI-Generated | What to Do Instead |
|---|---|---|
| Every section is a card with a shadow | AI defaults to card layouts for everything | Use cards only when content genuinely needs grouping |
| Uniform spacing everywhere | Mathematically equal spacing has no rhythm | Vary spacing intentionally — tighter between related items, more space between sections |
| Generic blue as primary color | The most statistically common SaaS color | Pick a specific color with a reason — relate it to the domain or client |
| Inter font for everything | Default font in most AI stacks | Inter is fine, but apply a clear type hierarchy — size, weight, and spacing must vary meaningfully |
| Gradient hero on every page | AI over-applies this pattern | Use gradients sparingly and purposefully, not as decoration |
| Perfectly centered everything | AI treats centering as a safe default | Left-align most content — left alignment is easier to scan |
| Icons next to every label | AI adds icons to look polished | Use icons only when they add meaning — decorative icons add visual noise |
| Placeholder-style copy | "Welcome back, User" and "Your dashboard" | Write copy for a real person in a real context |

### Interaction Red Flags

- No micro-interactions — buttons and inputs feel static and unresponsive
- Generic hover states — a simple opacity change on everything
- No loading states — content pops in without transition
- No empty states — blank screen when there is no data
- Identical transitions on every element — feels automated, not designed

### The Core Problem

AI generates the most common version of an interface. Common is not good.
Good design makes specific decisions for specific users. Always ask:
**"Who is sitting at this screen and what are they trying to do right now?"**
That question produces specific design decisions. AI without that context produces generic ones.

---

## 3. UI Design References

These are the apps that set the current standard for clean, professional, non-generic UI.
Study them as a user first — use the product, notice what feels good, notice what is invisible.

---

### Linear — linear.app

**Why it matters:** Considered the best-designed SaaS product currently in production.
Built by former Airbnb engineers who treated design as a core product feature, not an afterthought.

**What to take from it:**
- Every element is precisely calibrated — nothing is placed without a reason
- Speed is a design feature: the app responds instantly to every action. Fast feedback is good UX
- Dark background with a single restrained accent color — not dark mode for fashion, dark mode as a considered choice
- Animations are subtle and purposeful — they communicate state, not show off
- Information density is high but never overwhelming — the layout earns the user's trust

**Specific things to notice:**
- How keyboard shortcuts are surfaced without cluttering the UI
- How the sidebar hierarchy communicates structure without headers or dividers
- How empty states are designed — they are never just a blank screen

---

### Stripe Dashboard — dashboard.stripe.com

**Why it matters:** The gold standard for data-heavy admin interfaces.
Stripe handles complex financial data for millions of businesses and makes it feel approachable.

**What to take from it:**
- Typography hierarchy does the heavy lifting — size, weight, and color create clear levels without needing boxes or dividers
- Data tables are readable — proper column alignment, consistent formatting, clear sorting
- Error messages are specific and actionable — never just "Something went wrong"
- The onboarding progressively reveals complexity — you never feel overwhelmed at step one
- Charts and graphs are minimal — they show the insight, not the data

**Most relevant to this project:**
Stripe's dashboard handles admin tasks for non-technical users. Hospital admin interfaces
have a similar requirement — the users are not developers. Study how Stripe makes
complex data accessible to someone who does not understand the underlying system.

---

### Vercel Dashboard — vercel.com/dashboard

**Why it matters:** Clean, minimal, opinionated. Every screen has one primary action.

**What to take from it:**
- Progressive disclosure — show the most important information first, details on demand
- Status is always clear — green/red/yellow states are immediate and unambiguous
- Deployment logs and technical output are readable to non-technical people
- The navigation never gets in the way of the content

---

### Resend — resend.com

**Why it matters:** Directly relevant — this is the email service used in this stack.
The product itself is an excellent example of a clean, focused SaaS dashboard.

**What to take from it:**
- Minimal sidebar with clear hierarchy
- API key management UI that is secure-feeling without being intimidating
- Log views that are scannable — good use of monospace, color-coding, and timestamps
- Excellent empty states — the first-time user experience is clearly designed

---

### Supabase Dashboard — supabase.com/dashboard

**Why it matters:** This is the database and auth tool used in this stack.
Understanding its UI patterns makes it easier to design consistent admin tooling.

**What to take from it:**
- Table editor UI — clean data tables with inline editing patterns
- How database schema is visualised for non-technical users
- How RLS policies are explained in plain language alongside the technical config
- SQL editor with good syntax highlighting — reference for any code display in the app

---

### shadcn/ui Components — ui.shadcn.com

**Why it matters:** This is the component library used in this stack.
The website itself is the best reference for how to use the components correctly.

**What to take from it:**
- Each component page shows the correct usage — study the examples, not just the API
- Accessibility annotations on each component — shows what is expected of each element
- Spacing, sizing, and color tokens — use these consistently rather than inventing new values
- How variants are used — primary, secondary, destructive, ghost. Use the right variant for the context

**AI instruction:** When building any UI in this project, use shadcn/ui components
as the base. Do not invent custom button or input styles. Only deviate when there
is a clear reason, and document it.

---

## 4. Open Source Code References

These are real production codebases. The code is readable, well-structured, and follows
patterns that are worth learning from. Each one is relevant to what this project builds.

---

### Dub — github.com/dubinc/dub

**What it is:** Open-source link management platform. Next.js, TypeScript, Prisma, Tailwind.

**Why it is a good reference:**
- One of the cleanest Next.js App Router codebases publicly available
- Server actions, middleware, and API routes are all well-structured
- Multi-tenant architecture — directly relevant to the hospital-per-client model in this project
- Rate limiting with Upstash is implemented correctly — same pattern used here
- Error handling is consistent across the codebase

**Specific files worth reading:**
- `/apps/web/lib/auth/` — session handling and auth middleware
- `/apps/web/app/api/` — API route structure and response format consistency
- `/packages/utils/` — how utility functions are organised across a larger codebase

---

### Cal.com — github.com/calcom/cal.com

**What it is:** Open-source scheduling platform. Directly relevant — this project
builds scheduling features for hospitals.

**Why it is a good reference:**
- Large production codebase that handles booking, availability, and calendar logic
- Multi-timezone handling — relevant for any time-based feature
- Role-based access control implementation
- Email notification patterns using templates
- Form handling for complex multi-step flows

**Specific things worth reading:**
- How appointment availability is calculated
- How booking confirmation emails are structured
- How user roles and permissions are handled across the app

---

### Documenso — github.com/documenso/documenso

**What it is:** Open-source document signing platform. Next.js, Prisma, TypeScript.

**Why it is a good reference:**
- Clean separation between server and client code
- Good example of handling sensitive data and audit trails — directly relevant to patient records
- PDF generation and file handling patterns
- Email workflow implementation

---

### Taxonomy — github.com/shadcn-ui/taxonomy

**What it is:** A reference Next.js App Router application by the creator of shadcn/ui.

**Why it is a good reference:**
- Considered the gold standard for Next.js App Router project structure
- Shows correct usage of every shadcn/ui component in a real application context
- Authentication with NextAuth, database with Prisma, correct Typescript patterns throughout
- Small enough to read in full — unlike Cal.com or Dub, this is a manageable codebase

**Start here** if studying code references for the first time. It is the most
readable and most directly applicable to what this project builds.

---

### Vercel Next.js SaaS Starter — github.com/vercel/nextjs-saas-starter

**What it is:** Official Vercel SaaS starter template. 15,000+ GitHub stars.

**Why it is a good reference:**
- Auth, Stripe billing, team management, and role-based access all included
- Represents Vercel's official opinion on how a Next.js production app should be structured
- Well-commented and readable — designed to be studied, not just cloned

---

## 5. Design Principles to Apply

These principles are distilled from studying the above references.
They are written for AI to apply directly when building UI in this project.

---

### Hierarchy Before Decoration

Establish visual hierarchy through size, weight, and spacing first.
Add color and decoration only after hierarchy is clear.

```
❌ Everything is the same size, separated by colored cards
✅ Primary action is largest, secondary is smaller, helper text is smallest and muted
```

---

### One Primary Action Per Screen

Every screen or modal has one obvious primary action. Everything else is secondary.
The primary action button is always the most visually prominent element on the screen.

```
❌ Three equal-weight buttons: Save, Cancel, Delete
✅ One prominent Save button, one muted Cancel link, Delete hidden behind a confirmation flow
```

---

### Empty States Are Part of the Design

Every list, table, or data view has a designed empty state.
Empty states are not blank screens — they tell the user what will appear here
and give them an action to create their first item.

```
❌ Blank white area when no appointments exist
✅ Centered message: "No appointments yet" with a "Create Appointment" button
```

---

### Loading States Are Not Optional

Every async action has a loading state. The UI never freezes silently.
Buttons show a spinner or disabled state while an action is in progress.
Data fetching shows a skeleton or loading indicator.

```
❌ Button does nothing visible for 2 seconds, then the page changes
✅ Button shows "Saving..." and is disabled immediately on click
```

---

### Error Messages Are Actionable

Error messages tell the user what went wrong and what to do next.
They are written in plain language, not technical terms.

```
❌ "Error 500: Internal server error"
❌ "Something went wrong"
✅ "This appointment time is already taken. Please choose a different time."
✅ "Could not save. Check your connection and try again."
```

---

### Colour Is Used with Restraint

Use at most two brand colors plus semantic colors (red for errors, green for success,
yellow for warnings). Every use of color should have a reason.

```
❌ Blue headers, teal buttons, purple badges, orange tags
✅ One primary color for actions, grey for everything neutral, red/green only for status
```

---

### Spacing Creates Relationships

Items that belong together have less space between them than items that are separate.
This is called proximity and it is more powerful than borders or cards for showing structure.

```
❌ Equal 16px gap between every element on the page
✅ 4px between a label and its input, 24px between form sections, 48px between page sections
```

---

### Tables Need Alignment

In data tables:
- Text columns are left-aligned
- Number columns are right-aligned
- Status columns are center-aligned
- Column headers match the alignment of their data

This is not a style preference — misaligned tables are harder to scan and read as unprofessional.

---

### Forms Follow a Predictable Pattern

Every form in this project follows the same structure:
1. Label above the input (never beside it, never placeholder-only)
2. Validation error appears below the input it belongs to
3. Submit button is at the bottom, aligned to the left or full-width
4. Destructive actions (Delete) are separated visually from Save actions

---

*This document should grow over time. When a pattern is discovered that produces
good results, add it here. When a reference app ships a significant UI improvement,
note it.*
