# Desh Store - Mobile App Implementation Plan

## Project Overview

**Project Name:** Desh Store  
**Platform:** Flutter (iOS + Android)  
**Backend:** Extend existing Next.js API  
**Database:** PostgreSQL (shared with Desh Panel)  
**Payment:** Stripe (Visa/Credit Card)  
**Languages:** Arabic + English (RTL Support)  
**Shipping:** Saudi Arabia + Egypt  
**Currency:** Multi-currency (SAR + EGP)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND APPS                            │
├─────────────────────────────┬───────────────────────────────────┤
│    Desh Panel (Next.js)     │     Desh Store (Flutter)          │
│    ─────────────────────    │     ────────────────────          │
│    • Resellers (B2B)        │     • End Customers (B2C)         │
│    • Bulk renewals          │     • Single subscriptions        │
│    • User management        │     • Physical products           │
│    • Balance system         │     • Stripe payments             │
│    • Admin panel            │     • Order tracking              │
└─────────────┬───────────────┴───────────────────┬───────────────┘
              │                                   │
              │         SHARED BACKEND            │
              ▼                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js API Routes                           │
│  ┌─────────────────────┐  ┌─────────────────────────────────┐   │
│  │  /api/admin/*       │  │  /api/store/* (NEW)             │   │
│  │  /api/manager/*     │  │  • /api/store/auth              │   │
│  │  /api/user/*        │  │  • /api/store/products          │   │
│  │  /api/operations/*  │  │  • /api/store/orders            │   │
│  └─────────────────────┘  │  • /api/store/subscriptions     │   │
│                           │  • /api/store/payments          │   │
│                           └─────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PostgreSQL Database                        │
│  ┌─────────────────────┐  ┌─────────────────────────────────┐   │
│  │  Existing Tables    │  │  New Tables                     │   │
│  │  ─────────────────  │  │  ───────────────────────────    │   │
│  │  • User             │  │  • Customer                     │   │
│  │  • Transaction      │  │  • Product                      │   │
│  │  • Operation        │  │  • ProductCategory              │   │
│  │  • Setting          │  │  • Order / OrderItem            │   │
│  │  • BeINAccount      │  │  • StoreSubscription            │   │
│  │  ...                │  │  • Payment                      │   │
│  └─────────────────────┘  │  • ShippingRegion               │   │
│                           └─────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Database Schema (Week 1)

### New Prisma Models

#### 1.1 Customer Model (Store App Users)
```prisma
model Customer {
  id              String   @id @default(cuid())
  email           String   @unique
  phone           String?
  name            String
  nameAr          String?
  passwordHash    String
  isVerified      Boolean  @default(false)
  verifyToken     String?
  verifyExpires   DateTime?
  isActive        Boolean  @default(true)
  preferredLang   String   @default("ar")
  country         String   @default("SA")  // SA or EG
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  addresses       CustomerAddress[]
  orders          Order[]
  subscriptions   StoreSubscription[]
  payments        Payment[]
}
```

#### 1.2 CustomerAddress Model
```prisma
model CustomerAddress {
  id          String   @id @default(cuid())
  customerId  String
  name        String
  phone       String
  country     String   // SA or EG
  city        String
  district    String?
  street      String
  building    String?
  floor       String?
  apartment   String?
  postalCode  String?
  isDefault   Boolean  @default(false)
  createdAt   DateTime @default(now())
  
  customer    Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  orders      Order[]
}
```

#### 1.3 ProductCategory Model
```prisma
model ProductCategory {
  id          String    @id @default(cuid())
  name        String
  nameAr      String
  description String?
  descriptionAr String?
  image       String?
  isActive    Boolean   @default(true)
  sortOrder   Int       @default(0)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  products    Product[]
}
```

#### 1.4 Product Model
```prisma
model Product {
  id            String   @id @default(cuid())
  categoryId    String
  sku           String?  @unique
  name          String
  nameAr        String
  description   String?
  descriptionAr String?
  priceSAR      Float
  priceEGP      Float
  comparePriceSAR Float?  // Original price for discounts
  comparePriceEGP Float?
  stock         Int      @default(0)
  images        String[] // Array of image URLs
  specifications Json?   // Product specs
  isActive      Boolean  @default(true)
  isFeatured    Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  category      ProductCategory @relation(fields: [categoryId], references: [id])
  orderItems    OrderItem[]
}
```

#### 1.5 SubscriptionPackage Model
```prisma
model SubscriptionPackage {
  id          String   @id @default(cuid())
  name        String
  nameAr      String
  duration    Int      // months (1, 3, 6, 12)
  priceSAR    Float
  priceEGP    Float
  description String?
  descriptionAr String?
  features    String[] // List of features
  isActive    Boolean  @default(true)
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  subscriptions StoreSubscription[]
}
```

#### 1.6 Order Model
```prisma
model Order {
  id              String      @id @default(cuid())
  customerId      String
  addressId       String?
  orderNumber     String      @unique  // ORD-20240130-XXXX
  status          OrderStatus @default(PENDING)
  
  // Pricing
  currency        String      @default("SAR")
  subtotal        Float
  shippingCost    Float       @default(0)
  discount        Float       @default(0)
  total           Float
  
  // Shipping Info (snapshot at order time)
  shippingName    String
  shippingPhone   String
  shippingCountry String
  shippingCity    String
  shippingAddress String
  shippingNotes   String?
  
  // Tracking
  trackingNumber  String?
  paymentId       String?     @unique
  paidAt          DateTime?
  processedAt     DateTime?
  shippedAt       DateTime?
  deliveredAt     DateTime?
  cancelledAt     DateTime?
  cancelReason    String?
  
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  
  customer        Customer         @relation(fields: [customerId], references: [id])
  address         CustomerAddress? @relation(fields: [addressId], references: [id])
  items           OrderItem[]
  payment         Payment?
}

enum OrderStatus {
  PENDING          // Awaiting payment
  PAID             // Payment received
  PROCESSING       // Being prepared
  SHIPPED          // Shipped to customer
  DELIVERED        // Delivered
  CANCELLED        // Cancelled
  REFUNDED         // Refunded
}
```

#### 1.7 OrderItem Model
```prisma
model OrderItem {
  id        String   @id @default(cuid())
  orderId   String
  productId String
  name      String   // Snapshot of product name
  nameAr    String
  quantity  Int
  price     Float    // Price at time of purchase
  image     String?  // Snapshot of product image
  
  order     Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  product   Product  @relation(fields: [productId], references: [id])
}
```

#### 1.8 StoreSubscription Model
```prisma
model StoreSubscription {
  id          String             @id @default(cuid())
  customerId  String
  packageId   String
  cardNumber  String
  status      StoreSubStatus     @default(PENDING_PAYMENT)
  
  // Pricing
  currency    String             @default("SAR")
  price       Float
  
  // Links
  paymentId   String?            @unique
  operationId String?            @unique  // Links to existing Operation table
  
  // Result
  resultMessage String?
  completedAt   DateTime?
  failedAt      DateTime?
  refundedAt    DateTime?
  
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt
  
  customer    Customer           @relation(fields: [customerId], references: [id])
  package     SubscriptionPackage @relation(fields: [packageId], references: [id])
  payment     Payment?
  operation   Operation?         @relation(fields: [operationId], references: [id])
}

enum StoreSubStatus {
  PENDING_PAYMENT    // Awaiting Stripe payment
  PAID               // Payment received, queued for processing
  PROCESSING         // Operation in progress
  AWAITING_CAPTCHA   // Needs captcha
  AWAITING_PACKAGE   // Needs package selection
  COMPLETING         // Final step
  COMPLETED          // Successfully renewed
  FAILED             // Failed
  REFUNDED           // Refunded
  CANCELLED          // Cancelled
}
```

#### 1.9 Payment Model
```prisma
model Payment {
  id                  String        @id @default(cuid())
  customerId          String
  stripePaymentIntentId String      @unique
  stripeCustomerId    String?
  
  amount              Float
  currency            String        @default("SAR")
  status              PaymentStatus @default(PENDING)
  type                PaymentType
  
  // Metadata
  metadata            Json?
  failureMessage      String?
  refundedAmount      Float?
  refundedAt          DateTime?
  
  createdAt           DateTime      @default(now())
  updatedAt           DateTime      @updatedAt
  
  customer            Customer           @relation(fields: [customerId], references: [id])
  order               Order?
  subscription        StoreSubscription?
}

enum PaymentStatus {
  PENDING
  PROCESSING
  SUCCEEDED
  FAILED
  CANCELLED
  REFUNDED
  PARTIALLY_REFUNDED
}

enum PaymentType {
  ORDER          // Physical product order
  SUBSCRIPTION   // beIN subscription
}
```

#### 1.10 ShippingRegion Model
```prisma
model ShippingRegion {
  id          String   @id @default(cuid())
  country     String   // SA or EG
  countryName String
  countryNameAr String
  city        String
  cityAr      String
  shippingCostSAR Float
  shippingCostEGP Float
  estimatedDays Int    @default(3)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  
  @@unique([country, city])
}
```

### Files to Create
- `prisma/migrations/XXXXXX_add_store_models/migration.sql`
- Update `prisma/schema.prisma`

---

## Phase 2: Store API Routes (Week 1-2)

### 2.1 Authentication API

| Route | Method | Description |
|-------|--------|-------------|
| `/api/store/auth/register` | POST | Register new customer |
| `/api/store/auth/login` | POST | Login customer |
| `/api/store/auth/verify-email` | POST | Verify email with token |
| `/api/store/auth/resend-verification` | POST | Resend verification email |
| `/api/store/auth/forgot-password` | POST | Send password reset email |
| `/api/store/auth/reset-password` | POST | Reset password with token |
| `/api/store/auth/me` | GET | Get current customer |
| `/api/store/auth/logout` | POST | Logout (invalidate token) |

### 2.2 Products API

| Route | Method | Description |
|-------|--------|-------------|
| `/api/store/products` | GET | List products (paginated, filtered) |
| `/api/store/products/[id]` | GET | Get product details |
| `/api/store/products/featured` | GET | Get featured products |
| `/api/store/products/categories` | GET | List all categories |
| `/api/store/products/categories/[id]` | GET | Get category with products |
| `/api/store/products/search` | GET | Search products |

### 2.3 Subscriptions API

| Route | Method | Description |
|-------|--------|-------------|
| `/api/store/subscriptions/packages` | GET | List subscription packages |
| `/api/store/subscriptions/create` | POST | Start subscription (create operation) |
| `/api/store/subscriptions/[id]` | GET | Get subscription status |
| `/api/store/subscriptions/[id]/captcha` | POST | Submit captcha answer |
| `/api/store/subscriptions/[id]/select-package` | POST | Select beIN package |
| `/api/store/subscriptions/[id]/confirm` | POST | Confirm final payment |
| `/api/store/subscriptions/[id]/cancel` | POST | Cancel subscription |
| `/api/store/subscriptions/history` | GET | Customer's subscription history |

### 2.4 Orders API

| Route | Method | Description |
|-------|--------|-------------|
| `/api/store/orders` | GET | List customer's orders |
| `/api/store/orders` | POST | Create new order |
| `/api/store/orders/[id]` | GET | Get order details |
| `/api/store/orders/[id]/cancel` | POST | Cancel order (if pending) |

### 2.5 Customer API

| Route | Method | Description |
|-------|--------|-------------|
| `/api/store/customer/profile` | GET | Get profile |
| `/api/store/customer/profile` | PUT | Update profile |
| `/api/store/customer/password` | PUT | Change password |
| `/api/store/customer/addresses` | GET | List saved addresses |
| `/api/store/customer/addresses` | POST | Add new address |
| `/api/store/customer/addresses/[id]` | PUT | Update address |
| `/api/store/customer/addresses/[id]` | DELETE | Delete address |

### 2.6 Payments API

| Route | Method | Description |
|-------|--------|-------------|
| `/api/store/payments/create-intent` | POST | Create Stripe PaymentIntent |
| `/api/store/payments/confirm` | POST | Confirm payment succeeded |
| `/api/store/payments/webhook` | POST | Stripe webhook handler |

### 2.7 Shipping API

| Route | Method | Description |
|-------|--------|-------------|
| `/api/store/shipping/regions` | GET | Get available shipping regions |
| `/api/store/shipping/calculate` | POST | Calculate shipping cost |

### Files to Create
```
src/app/api/store/
├── auth/
│   ├── register/route.ts
│   ├── login/route.ts
│   ├── verify-email/route.ts
│   ├── resend-verification/route.ts
│   ├── forgot-password/route.ts
│   ├── reset-password/route.ts
│   ├── me/route.ts
│   └── logout/route.ts
├── products/
│   ├── route.ts
│   ├── [id]/route.ts
│   ├── featured/route.ts
│   ├── categories/route.ts
│   ├── categories/[id]/route.ts
│   └── search/route.ts
├── subscriptions/
│   ├── packages/route.ts
│   ├── create/route.ts
│   ├── history/route.ts
│   └── [id]/
│       ├── route.ts
│       ├── captcha/route.ts
│       ├── select-package/route.ts
│       ├── confirm/route.ts
│       └── cancel/route.ts
├── orders/
│   ├── route.ts
│   └── [id]/
│       ├── route.ts
│       └── cancel/route.ts
├── customer/
│   ├── profile/route.ts
│   ├── password/route.ts
│   └── addresses/
│       ├── route.ts
│       └── [id]/route.ts
├── payments/
│   ├── create-intent/route.ts
│   ├── confirm/route.ts
│   └── webhook/route.ts
└── shipping/
    ├── regions/route.ts
    └── calculate/route.ts
```

---

## Phase 3: Admin Panel Store Section (Week 3)

### 3.1 New Admin Pages

| Page | Path | Description |
|------|------|-------------|
| Store Dashboard | `/dashboard/admin/store` | Analytics & overview |
| Products | `/dashboard/admin/store/products` | Product CRUD |
| Categories | `/dashboard/admin/store/categories` | Category CRUD |
| Orders | `/dashboard/admin/store/orders` | Order management |
| Subscriptions | `/dashboard/admin/store/subscriptions` | Store subscriptions |
| Customers | `/dashboard/admin/store/customers` | Customer list |
| Shipping | `/dashboard/admin/store/shipping` | Shipping regions & costs |
| Settings | `/dashboard/admin/store/settings` | Store settings |

### 3.2 Admin Features

#### Products Management
- Add/Edit/Delete products
- Upload multiple images
- Set prices in SAR and EGP
- Manage stock
- Set featured products
- Bulk actions (activate/deactivate)

#### Categories Management
- Add/Edit/Delete categories
- Upload category images
- Set sort order
- Arabic/English names

#### Orders Management
- View all orders
- Filter by status, date, customer
- Update order status
- Add tracking number
- Print order details
- Process refunds

#### Subscriptions Management
- View store subscription orders
- See linked operations
- Process refunds
- View captcha history

#### Customers Management
- View all customers
- See order history
- Activate/Deactivate accounts
- View customer details

#### Shipping Management
- Add/Edit shipping regions
- Set costs per city
- Enable/Disable regions

### Files to Create
```
src/app/dashboard/admin/store/
├── page.tsx                    (Dashboard)
├── layout.tsx                  (Store layout with submenu)
├── products/
│   ├── page.tsx               (Products list)
│   └── [id]/page.tsx          (Edit product)
├── categories/
│   └── page.tsx               (Categories list)
├── orders/
│   ├── page.tsx               (Orders list)
│   └── [id]/page.tsx          (Order details)
├── subscriptions/
│   └── page.tsx               (Subscriptions list)
├── customers/
│   ├── page.tsx               (Customers list)
│   └── [id]/page.tsx          (Customer details)
├── shipping/
│   └── page.tsx               (Shipping regions)
└── settings/
    └── page.tsx               (Store settings)

src/components/admin/store/
├── StoreDashboard.tsx
├── StoreAnalytics.tsx
├── ProductsTable.tsx
├── ProductForm.tsx
├── CategoriesTable.tsx
├── CategoryForm.tsx
├── OrdersTable.tsx
├── OrderDetails.tsx
├── OrderStatusBadge.tsx
├── SubscriptionsTable.tsx
├── CustomersTable.tsx
├── CustomerDetails.tsx
├── ShippingTable.tsx
└── ShippingForm.tsx
```

---

## Phase 4: Stripe Integration (Week 4)

### 4.1 Setup Requirements
- Stripe account with completed verification
- API keys (test mode, then live)
- Webhook endpoint configured

### 4.2 Payment Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Customer  │     │   Backend   │     │   Stripe    │
│   (App)     │     │   (API)     │     │             │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │ 1. Create Order   │                   │
       │──────────────────>│                   │
       │                   │                   │
       │                   │ 2. Create Intent  │
       │                   │──────────────────>│
       │                   │                   │
       │                   │ 3. Client Secret  │
       │                   │<──────────────────│
       │                   │                   │
       │ 4. Client Secret  │                   │
       │<──────────────────│                   │
       │                   │                   │
       │ 5. Confirm Payment (Stripe SDK)       │
       │──────────────────────────────────────>│
       │                   │                   │
       │                   │ 6. Webhook Event  │
       │                   │<──────────────────│
       │                   │                   │
       │                   │ 7. Update Order   │
       │                   │───────────────────│
       │                   │                   │
       │ 8. Payment Success│                   │
       │<──────────────────│                   │
       │                   │                   │
```

### 4.3 Multi-Currency Support

```typescript
// Currency configuration
const currencies = {
  SA: {
    code: 'SAR',
    symbol: 'ر.س',
    name: 'Saudi Riyal',
    stripeCode: 'sar'
  },
  EG: {
    code: 'EGP',
    symbol: 'ج.م',
    name: 'Egyptian Pound',
    stripeCode: 'egp'
  }
}
```

### Files to Create
```
src/lib/stripe.ts              (Stripe server utilities)
src/lib/currencies.ts          (Currency helpers)
```

### Environment Variables
```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## Phase 5: Flutter Mobile App (Week 5-8)

### 5.1 Project Structure

```
desh_store_app/
├── lib/
│   ├── main.dart
│   │
│   ├── app/
│   │   ├── app.dart
│   │   ├── routes.dart
│   │   └── theme.dart
│   │
│   ├── core/
│   │   ├── api/
│   │   │   ├── api_client.dart
│   │   │   ├── api_endpoints.dart
│   │   │   └── api_interceptors.dart
│   │   ├── storage/
│   │   │   ├── secure_storage.dart
│   │   │   └── preferences.dart
│   │   ├── localization/
│   │   │   ├── app_localizations.dart
│   │   │   ├── ar.json
│   │   │   └── en.json
│   │   └── utils/
│   │       ├── validators.dart
│   │       ├── formatters.dart
│   │       └── helpers.dart
│   │
│   ├── features/
│   │   ├── auth/
│   │   │   ├── screens/
│   │   │   │   ├── splash_screen.dart
│   │   │   │   ├── login_screen.dart
│   │   │   │   ├── register_screen.dart
│   │   │   │   ├── verify_email_screen.dart
│   │   │   │   └── forgot_password_screen.dart
│   │   │   ├── providers/
│   │   │   │   └── auth_provider.dart
│   │   │   └── models/
│   │   │       └── customer.dart
│   │   │
│   │   ├── home/
│   │   │   ├── screens/
│   │   │   │   └── home_screen.dart
│   │   │   └── widgets/
│   │   │       ├── featured_products_carousel.dart
│   │   │       ├── categories_grid.dart
│   │   │       ├── promo_banner.dart
│   │   │       └── subscription_card.dart
│   │   │
│   │   ├── products/
│   │   │   ├── screens/
│   │   │   │   ├── products_screen.dart
│   │   │   │   ├── product_detail_screen.dart
│   │   │   │   └── category_products_screen.dart
│   │   │   ├── providers/
│   │   │   │   └── products_provider.dart
│   │   │   ├── models/
│   │   │   │   ├── product.dart
│   │   │   │   └── category.dart
│   │   │   └── widgets/
│   │   │       ├── product_card.dart
│   │   │       ├── product_grid.dart
│   │   │       └── category_chip.dart
│   │   │
│   │   ├── subscriptions/
│   │   │   ├── screens/
│   │   │   │   ├── packages_screen.dart
│   │   │   │   ├── enter_card_screen.dart
│   │   │   │   ├── captcha_screen.dart
│   │   │   │   ├── select_package_screen.dart
│   │   │   │   ├── confirm_screen.dart
│   │   │   │   └── result_screen.dart
│   │   │   ├── providers/
│   │   │   │   └── subscription_provider.dart
│   │   │   └── models/
│   │   │       └── subscription.dart
│   │   │
│   │   ├── cart/
│   │   │   ├── screens/
│   │   │   │   └── cart_screen.dart
│   │   │   ├── providers/
│   │   │   │   └── cart_provider.dart
│   │   │   └── widgets/
│   │   │       └── cart_item.dart
│   │   │
│   │   ├── checkout/
│   │   │   ├── screens/
│   │   │   │   ├── checkout_screen.dart
│   │   │   │   ├── shipping_screen.dart
│   │   │   │   ├── payment_screen.dart
│   │   │   │   └── order_success_screen.dart
│   │   │   └── providers/
│   │   │       └── checkout_provider.dart
│   │   │
│   │   ├── orders/
│   │   │   ├── screens/
│   │   │   │   ├── orders_screen.dart
│   │   │   │   └── order_detail_screen.dart
│   │   │   ├── providers/
│   │   │   │   └── orders_provider.dart
│   │   │   └── models/
│   │   │       └── order.dart
│   │   │
│   │   └── profile/
│   │       ├── screens/
│   │       │   ├── profile_screen.dart
│   │       │   ├── edit_profile_screen.dart
│   │       │   ├── addresses_screen.dart
│   │       │   ├── change_password_screen.dart
│   │       │   └── settings_screen.dart
│   │       └── widgets/
│   │           └── profile_menu_item.dart
│   │
│   └── shared/
│       ├── widgets/
│       │   ├── app_button.dart
│       │   ├── app_text_field.dart
│       │   ├── app_bar.dart
│       │   ├── loading_indicator.dart
│       │   ├── error_widget.dart
│       │   ├── empty_state.dart
│       │   └── network_image.dart
│       └── constants/
│           ├── colors.dart
│           ├── text_styles.dart
│           └── dimensions.dart
│
├── assets/
│   ├── images/
│   │   ├── logo.png
│   │   ├── placeholder.png
│   │   └── ...
│   ├── fonts/
│   │   └── Cairo/
│   └── icons/
│
├── ios/
├── android/
├── pubspec.yaml
└── README.md
```

### 5.2 Key Packages

```yaml
dependencies:
  flutter:
    sdk: flutter
  flutter_localizations:
    sdk: flutter
  
  # State Management
  provider: ^6.1.1
  
  # API & Networking
  dio: ^5.4.0
  
  # Local Storage
  flutter_secure_storage: ^9.0.0
  shared_preferences: ^2.2.2
  
  # Stripe Payments
  flutter_stripe: ^10.1.1
  
  # UI Components
  cached_network_image: ^3.3.1
  shimmer: ^3.0.0
  flutter_svg: ^2.0.9
  carousel_slider: ^4.2.1
  badges: ^3.1.2
  
  # Forms & Validation
  reactive_forms: ^17.0.1
  
  # Utilities
  intl: ^0.19.0
  url_launcher: ^6.2.2
  image_picker: ^1.0.7
  
  # Notifications
  firebase_core: ^2.24.2
  firebase_messaging: ^14.7.10
  flutter_local_notifications: ^16.3.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^3.0.1
  flutter_launcher_icons: ^0.13.1
```

### 5.3 App Screens Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                          DESH STORE APP                             │
└─────────────────────────────────────────────────────────────────────┘

                         ┌──────────────┐
                         │    Splash    │
                         │    Screen    │
                         └──────┬───────┘
                                │
              ┌─────────────────┼─────────────────┐
              │ (Not Logged)    │ (Logged In)     │
              ▼                 │                 ▼
       ┌──────────────┐         │          ┌──────────────┐
       │    Login     │         │          │     Home     │
       │    Screen    │         │          │    Screen    │
       └──────┬───────┘         │          └──────┬───────┘
              │                 │                 │
              ▼                 │                 │
       ┌──────────────┐         │    ┌────────────┴────────────┐
       │   Register   │         │    │                         │
       │    Screen    │         │    │    BOTTOM NAVIGATION    │
       └──────┬───────┘         │    │                         │
              │                 │    ├──────┬──────┬──────┬────┤
              ▼                 │    │ Home │ Sub  │ Cart │Prof│
       ┌──────────────┐         │    └──┬───┴──┬───┴──┬───┴──┬─┘
       │ Verify Email │         │       │      │      │      │
       │    Screen    │─────────┘       │      │      │      │
       └──────────────┘                 │      │      │      │
                                        ▼      ▼      ▼      ▼
                                   ┌────────────────────────────┐
                                   │   Feature Specific Flows   │
                                   └────────────────────────────┘
```

### 5.4 RTL Support

```dart
// main.dart
MaterialApp(
  localizationsDelegates: [
    AppLocalizations.delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
  ],
  supportedLocales: [
    Locale('ar'),
    Locale('en'),
  ],
  locale: _locale,
  builder: (context, child) {
    return Directionality(
      textDirection: _locale.languageCode == 'ar' 
        ? TextDirection.rtl 
        : TextDirection.ltr,
      child: child!,
    );
  },
)
```

---

## Phase 6: Testing & Deployment (Week 9-10)

### 6.1 Testing Checklist

#### Backend Testing
- [ ] All API endpoints work correctly
- [ ] Authentication flow (register, login, verify, reset)
- [ ] Product listing and filtering
- [ ] Order creation and management
- [ ] Subscription flow connects to worker
- [ ] Stripe payment processing
- [ ] Webhook handling
- [ ] Multi-currency support

#### Admin Panel Testing
- [ ] Product CRUD operations
- [ ] Category management
- [ ] Order status updates
- [ ] Customer management
- [ ] Shipping configuration
- [ ] Analytics display correctly

#### Flutter App Testing
- [ ] All screens render correctly
- [ ] RTL layout works properly
- [ ] Arabic translations complete
- [ ] Cart functionality
- [ ] Checkout flow
- [ ] Subscription flow with captcha
- [ ] Payment integration
- [ ] Push notifications
- [ ] Offline handling

### 6.2 App Store Submission

#### Apple App Store
1. Create app in App Store Connect
2. Fill in app information
3. Upload screenshots (iPhone, iPad)
4. Set pricing (Free)
5. Submit for review
6. Address any review feedback

#### Google Play Store
1. Create app in Play Console
2. Fill in store listing
3. Upload screenshots
4. Create privacy policy
5. Submit for review
6. Monitor for issues

### 6.3 Production Deployment

1. Switch Stripe to live mode
2. Update API URLs in Flutter app
3. Build release versions
4. Deploy backend updates
5. Submit apps to stores
6. Monitor for errors

---

## Environment Variables (New)

```env
# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email (for verification)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@deshpanel.com
SMTP_PASS=...
EMAIL_FROM=noreply@deshpanel.com

# Store Settings
STORE_NAME=Desh Store
STORE_SUPPORT_EMAIL=support@deshpanel.com
STORE_SUPPORT_PHONE=+966...

# Currency Exchange (optional - for auto conversion)
EXCHANGE_API_KEY=...
```

---

## Summary

### What Stays the Same
- All existing panel functionality
- Reseller features
- Admin management
- Worker/automation system
- Database structure (extended, not changed)

### What's New
1. **Database**: 10 new tables for store functionality
2. **API**: ~40 new endpoints under `/api/store/*`
3. **Admin**: New store section with 8 pages
4. **Mobile App**: Complete Flutter app with all features
5. **Payments**: Stripe integration for end customers
6. **Multi-Currency**: SAR and EGP support
7. **Shipping**: Saudi Arabia and Egypt regions

### Timeline
- **Week 1-2**: Database + API
- **Week 3**: Admin Panel
- **Week 4**: Stripe Integration
- **Week 5-8**: Flutter App
- **Week 9-10**: Testing + Deployment

### Your Tasks
1. Set up Stripe account
2. Set up Apple Developer account ($99/year)
3. Set up Google Play Developer account ($25)
4. Provide API keys when ready

---

*Document created: January 30, 2026*  
*Project: Desh Store Mobile App*  
*Version: 1.0*
