# Dashboard Enhancement Prompts

Two separate prompts for enhancing the dashboard. Execute in order.

---

# Prompt 1: Dashboard Visual Enhancements

## Task

Redesign and enhance the dashboard home page to make it more visually stunning and engaging while keeping the current excellent dark theme with green/blue color scheme. Focus on modern animations, glassmorphism effects, and smooth transitions.

## Project Stack

- Next.js 16 with App Router
- React 19
- Tailwind CSS 4
- Framer Motion (already installed)
- Dark theme with green (#00A651, #00ff00) and blue (#3b82f6) accents

## Current Dashboard Location

- File: `src/app/dashboard/page.tsx`
- Components: `src/components/dashboard/`

## Requirements

### 1. Statistics Cards Enhancement

- Add glassmorphism effect (backdrop-blur, semi-transparent background)
- Implement smooth hover effects with scale transform
- Add animated gradient borders that glow on hover
- Include pulsing/glowing icons
- Add subtle shadow and depth
- Implement number counter animation when values change

### 2. Balance Display Enhancement

- Add animated gradient text effect to the main number
- Implement smooth counter animation on value changes
- Add subtle glow/aura around the balance card
- Include trend indicator with animated arrow (up/down)
- Make it more prominent with better typography

### 3. Cards & Containers

- Apply consistent glassmorphism across all cards
- Add subtle gradient overlays
- Implement smooth fade-in animations on page load
- Add hover effects with elevation changes
- Use better spacing and visual hierarchy

### 4. Interactive Elements

- Smooth hover transitions (transform, shadow, glow)
- Implement loading skeletons with shimmer
- Add smooth color transitions
- Create fluid animations between states

### 5. Color Scheme (Keep Current)

- Primary Green: #00A651, #00ff00
- Accent Blue: #3b82f6
- Background: #0a0e1a range
- Use gradients: #3b82f6 → #00ff00

## CSS Guidelines

### Glassmorphism Style

```css
background: rgba(255, 255, 255, 0.05);
backdrop-filter: blur(10px);
border: 1px solid rgba(255, 255, 255, 0.1);
box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
```

### Animated Gradient Border

```css
border: 2px solid transparent;
background: linear-gradient(#0a0e1a, #0a0e1a) padding-box,
            linear-gradient(90deg, #3b82f6, #00ff00, #3b82f6) border-box;
background-size: 200% 100%;
animation: gradient-shift 3s ease infinite;
```

### Hover Transform

```css
transition: all 0.3s ease;
&:hover {
  transform: translateY(-5px) scale(1.02);
  box-shadow: 0 10px 40px rgba(0, 255, 0, 0.2);
}
```

## Performance Requirements

- All animations: 60fps, GPU-accelerated
- Use transform and opacity (avoid layout shifts)
- Respect prefers-reduced-motion for accessibility
- Keep bundle size small

## Expected Output

- Visually stunning, modern dashboard
- Smooth animations and micro-interactions
- Professional glassmorphism design
- Maintains current color scheme
- Fully responsive

---

# Prompt 2: Announcement Banner System

## Task

Create a dynamic, eye-catching announcement banner system that can be configured from admin settings. The banner should display animated, colorful text at the top of the dashboard to grab immediate user attention.

## Project Stack

- Next.js 16 with App Router
- PostgreSQL with Prisma ORM
- React 19 / Tailwind CSS 4
- Dark theme with green/blue accents

## Requirements

### 1. Database Schema (Prisma)

Add to `prisma/schema.prisma`:

```prisma
model AnnouncementBanner {
  id            String   @id @default(cuid())
  message       String
  isActive      Boolean  @default(true)
  animationType String   @default("gradient") // gradient, typing, glow, slide, marquee, none
  colors        Json     @default("[]")
  textSize      String   @default("medium") // small, medium, large
  position      String   @default("top") // top, bottom, floating
  isDismissable Boolean  @default(true)
  startDate     DateTime?
  endDate       DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([isActive])
  @@map("announcement_banners")
}
```

Run: `npx prisma migrate dev --name add_announcement_banner`

### 2. API Endpoints (Next.js App Router)

**Get Active Banner (Public):**
`src/app/api/announcement/active/route.ts`

```typescript
export async function GET() {
  const banner = await prisma.announcementBanner.findFirst({
    where: {
      isActive: true,
      OR: [
        { startDate: null, endDate: null },
        { startDate: { lte: new Date() }, endDate: { gte: new Date() } }
      ]
    }
  });
  return Response.json({ success: true, banner });
}
```

**Admin CRUD:**

- `src/app/api/admin/announcement/route.ts` (GET all, POST create)
- `src/app/api/admin/announcement/[id]/route.ts` (PUT, DELETE, PATCH toggle)

### 3. Banner Component

Create `src/components/AnnouncementBanner.tsx`:

**Animation Types to Implement:**

- `gradient`: Flowing gradient text animation
- `typing`: Typing effect with cursor (custom implementation, no external library)
- `glow`: Pulsing neon glow effect
- `slide`: Slide in from left/right
- `marquee`: Scrolling text
- `none`: Static text

**Features:**

- Display announcement message
- Animated text based on animationType
- Dismiss functionality with localStorage
- Responsive design
- Smooth entrance animation

### 4. Admin Settings Page

Create: `src/app/dashboard/admin/settings/announcements/page.tsx`

**Form Fields:**

- Message (textarea, max 200 chars)
- Animation Type (select dropdown)
- Colors (color picker for gradient)
- Text Size (radio: small/medium/large)
- Position (select: top/bottom/floating)
- Active (toggle switch)
- Dismissable (checkbox)
- Start/End Date (date pickers, optional)

**Features:**

- Live preview of banner with settings
- Save button
- Validation and error handling
- Success notifications (use sonner toast)

### 5. Animation CSS

**Gradient Flow:**

```css
@keyframes gradient-flow {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}

.gradient-text {
  background: linear-gradient(90deg, #ff0080, #ff8c00, #40e0d0, #ff0080);
  background-size: 300% 100%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: gradient-flow 3s ease infinite;
}
```

**Glow Effect:**

```css
@keyframes pulse-glow {
  0%, 100% { text-shadow: 0 0 20px currentColor; }
  50% { text-shadow: 0 0 40px currentColor, 0 0 60px currentColor; }
}

.glow-text {
  animation: pulse-glow 2s ease-in-out infinite;
}
```

**Marquee:**

```css
@keyframes marquee {
  from { transform: translateX(100%); }
  to { transform: translateX(-100%); }
}

.marquee {
  animation: marquee 15s linear infinite;
}
```

### 6. Suggested Color Gradients

```typescript
const presetGradients = {
  matrixGreen: ["#00ff00", "#00cc00", "#00ff00"],
  fire: ["#ff0080", "#ff8c00", "#ffff00"],
  ocean: ["#00d2ff", "#3a7bd5", "#00d2ff"],
  neon: ["#00ff87", "#60efff", "#00ff87"],
  rainbow: ["#ff0080", "#ff8c00", "#40e0d0", "#8e2de2", "#ff0080"]
};
```

### 7. Dismiss Functionality

```typescript
// Store dismissed banner ID in localStorage
localStorage.setItem('dismissed_banner_id', banner.id);
// Don't show again for 24 hours or until new banner
```

### 8. Integration

Add banner to dashboard layout:

- Position at top of dashboard
- Load banner data on mount
- Respect dismiss state
- Smooth entrance animation
- No layout shift

## Implementation Order

1. **Backend (30 mins)**: Prisma schema → Migration → API routes
2. **Banner Component (45 mins)**: All animation types + styling
3. **Admin Settings (45 mins)**: Form UI + live preview + API integration
4. **Integration (20 mins)**: Add to dashboard + testing

## Expected Output

- Fully functional announcement banner system
- Eye-catching animated text effects
- Complete admin configuration interface
- Multiple animation options
- Responsive and performant
- Easy to manage from settings

---

## Execution Order

1. **First**: Execute Prompt 1 (Dashboard Visual Enhancements)
2. **Second**: Execute Prompt 2 (Announcement Banner System)

Both prompts are designed for the same project and share the same color scheme.
