# DESH STORE - Implementation Tasks

> **Project:** beIN Sports B2C Mobile Store App  
> **Started:** January 30, 2026  
> **Last Updated:** January 30, 2026  
> **Status:** Phase 2 In Progress

---

## Quick Navigation

- [Phase 1: Database Schema](#phase-1-database-schema-week-1)
- [Phase 2: Store API Routes](#phase-2-store-api-routes-week-1-2)
- [Phase 3: Admin Panel](#phase-3-admin-panel-store-section-week-3)
- [Phase 4: Stripe Integration](#phase-4-stripe-integration-week-4)
- [Phase 5: Flutter Mobile App](#phase-5-flutter-mobile-app-week-5-8)
- [Phase 6: Testing & Deployment](#phase-6-testing--deployment-week-9-10)

---

## Key Decisions Reference

| Decision | Choice |
|----------|--------|
| Package Source | Fetch from beIN dynamically (like resellers) |
| Payment Timing | After selecting package (before captcha) |
| Pricing Strategy | Percentage markup on beIN prices (default 20%) |
| If Operation Fails | Store credit for retry (no Stripe refund) |
| Authentication | JWT tokens (separate from reseller NextAuth) |
| Currencies | SAR (Saudi) + EGP (Egypt) |

---

## Phase 1: Database Schema (Week 1)

### 1.1 Prisma Models

- [x] **Customer Model**
  - [x] Basic fields (email, phone, name, nameAr)
  - [x] Authentication (passwordHash, isVerified, verifyToken)
  - [x] Password reset (resetToken, resetExpires)
  - [x] Preferences (preferredLang, country)
  - [x] `storeCredit` field for failed operation refunds
  - [x] Relations (addresses, orders, subscriptions, payments)

- [x] **CustomerAddress Model**
  - [x] Address fields (country, city, district, street, building, floor, apartment)
  - [x] Contact info (name, phone)
  - [x] isDefault flag
  - [x] Relation to Customer

- [x] **ProductCategory Model**
  - [x] Bilingual names (name, nameAr)
  - [x] Bilingual descriptions
  - [x] Image URL
  - [x] isActive, sortOrder
  - [x] Relation to Products

- [x] **Product Model**
  - [x] Bilingual names and descriptions
  - [x] Multi-currency prices (priceSAR, priceEGP)
  - [x] Compare prices for discounts
  - [x] Stock management
  - [x] Images array
  - [x] Specifications JSON
  - [x] isFeatured flag
  - [x] Relation to Category

- [x] **SubscriptionPackage Model**
  - [x] Bilingual names and descriptions
  - [x] Duration (months)
  - [x] Multi-currency prices
  - [x] Features array
  - [x] isActive, sortOrder

- [x] **Order Model**
  - [x] Order number generation
  - [x] OrderStatus enum (PENDING → DELIVERED)
  - [x] Pricing (subtotal, shippingCost, discount, total)
  - [x] Shipping info snapshot
  - [x] Tracking number
  - [x] Timestamps (paidAt, processedAt, shippedAt, deliveredAt)
  - [x] Relations (Customer, Address, Items, Payment)

- [x] **OrderItem Model**
  - [x] Product snapshot (name, nameAr, price, image)
  - [x] Quantity
  - [x] Relations (Order, Product)

- [x] **StoreSubscription Model**
  - [x] Card number
  - [x] StoreSubStatus enum with all states
  - [x] Package info from beIN (packageName, packagePrice)
  - [x] Markup pricing (markupPercent, price)
  - [x] Store credit used (creditUsed)
  - [x] Stripe PaymentIntent ID
  - [x] Result tracking (resultMessage, completedAt, failedAt)
  - [x] Link to Operation table
  - [x] Relations (Customer, Package, Payment, Operation)

- [x] **Payment Model**
  - [x] Stripe fields (paymentIntentId, customerId)
  - [x] Amount and currency
  - [x] PaymentStatus enum
  - [x] PaymentType enum (ORDER, SUBSCRIPTION)
  - [x] Metadata JSON
  - [x] Refund tracking
  - [x] Relations (Customer, Order, Subscription)

- [x] **ShippingRegion Model**
  - [x] Country and city (bilingual)
  - [x] Multi-currency shipping costs
  - [x] Estimated delivery days
  - [x] isActive flag
  - [x] Unique constraint (country + city)

- [x] **StoreSetting Model** (if not using existing Setting)
  - [x] Key-value pairs for store config

### 1.2 Enums

- [x] **StoreSubStatus**
  ```
  PENDING → AWAITING_PACKAGE → AWAITING_PAYMENT → PAID → 
  PROCESSING → AWAITING_CAPTCHA → COMPLETING → COMPLETED
  (or FAILED / REFUNDED / CANCELLED)
  ```

- [x] **OrderStatus**
  ```
  PENDING → PAID → PROCESSING → SHIPPED → DELIVERED
  (or CANCELLED / REFUNDED)
  ```

- [x] **PaymentStatus**
  ```
  PENDING → PROCESSING → SUCCEEDED
  (or FAILED / CANCELLED / REFUNDED / PARTIALLY_REFUNDED)
  ```

- [x] **PaymentType**
  ```
  ORDER | SUBSCRIPTION
  ```

### 1.3 Database Operations

- [x] Update `prisma/schema.prisma` with all models
- [x] Run `npx prisma db push` to sync database
- [x] Run `npx prisma generate` to update client
- [x] Update `prisma/seed.ts` with:
  - [x] Sample categories
  - [x] Sample products
  - [x] Shipping regions (Saudi cities, Egypt cities)
  - [x] Store settings (store_markup_percentage = 20)

### 1.4 Commit Checkpoint

- [x] Commit: `feat(store): add database schema for DESH STORE`

---

## Phase 2: Store API Routes (Week 1-2)

### 2.1 Authentication API (`/api/store/auth/*`)

- [x] **POST `/api/store/auth/register`**
  - [x] Validate email, password, name
  - [x] Hash password with bcrypt
  - [x] Create customer record
  - [x] Generate verification token
  - [x] Send verification email (or log token for dev)
  - [x] Return success message

- [x] **POST `/api/store/auth/login`**
  - [x] Validate email and password
  - [x] Check password hash
  - [x] Check if verified (optional enforcement)
  - [x] Generate JWT token
  - [x] Update lastLoginAt
  - [x] Return token and customer data

- [x] **POST `/api/store/auth/verify-email`**
  - [x] Validate token from request
  - [x] Find customer by token
  - [x] Check token expiry
  - [x] Mark customer as verified
  - [x] Clear verification token

- [x] **POST `/api/store/auth/forgot-password`**
  - [x] Find customer by email
  - [x] Generate reset token
  - [x] Set token expiry (1 hour)
  - [x] Send reset email (or log for dev)

- [x] **POST `/api/store/auth/reset-password`**
  - [x] Validate token and new password
  - [x] Find customer by token
  - [x] Check token expiry
  - [x] Hash new password
  - [x] Update password and clear token

- [x] **GET `/api/store/auth/me`**
  - [x] Verify JWT from Authorization header
  - [x] Return customer profile
  - [x] Include store credit balance

### 2.2 Utility Library: `src/lib/store-auth.ts`

- [x] `generateToken(customerId)` - Create JWT
- [x] `verifyToken(token)` - Validate JWT
- [x] `getCustomerFromRequest(request)` - Extract customer from header
- [x] `hashPassword(password)` - Bcrypt hash
- [x] `comparePassword(password, hash)` - Bcrypt compare
- [x] `generateRandomToken()` - For email verification/reset

### 2.3 Products API (`/api/store/products/*`)

- [x] **GET `/api/store/products`**
  - [x] Pagination (page, limit)
  - [x] Filter by category
  - [x] Filter by featured
  - [x] Search by name
  - [x] Sort options (price, name, date)
  - [x] Only return active products
  - [x] Include category info

- [x] **GET `/api/store/products/[id]`**
  - [x] Get single product by ID
  - [x] Include category
  - [x] Check isActive
  - [x] Return 404 if not found

### 2.4 Categories API (`/api/store/categories/*`)

- [x] **GET `/api/store/categories`**
  - [x] List all active categories
  - [x] Sort by sortOrder
  - [x] Include product count

### 2.5 Addresses API (`/api/store/addresses/*`)

- [x] **GET `/api/store/addresses`**
  - [x] Require authentication
  - [x] List customer's addresses
  - [x] Sort by isDefault, then createdAt

- [x] **POST `/api/store/addresses`**
  - [x] Require authentication
  - [x] Validate address fields
  - [x] Create address record
  - [x] Handle isDefault (unset others if new default)

- [x] **GET `/api/store/addresses/[id]`**
  - [x] Require authentication
  - [x] Get single address
  - [x] Verify ownership

- [x] **PUT `/api/store/addresses/[id]`**
  - [x] Require authentication
  - [x] Update address fields
  - [x] Handle isDefault changes

- [x] **DELETE `/api/store/addresses/[id]`**
  - [x] Require authentication
  - [x] Verify ownership
  - [x] Delete address
  - [x] Handle if deleting default (set another as default?)

### 2.6 Shipping API (`/api/store/shipping/*`)

- [x] **GET `/api/store/shipping`**
  - [x] List shipping regions
  - [x] Filter by country (optional)
  - [x] Only return active regions
  - [x] Return costs based on currency

### 2.7 Subscriptions API (`/api/store/subscriptions/*`) - STRIPE FLOW

#### Utility Library: `src/lib/store-pricing.ts`

- [x] `getMarkupPercentage()` - Get from settings (default 20%)
- [x] `calculateCustomerPrice(beinPrice, markupPercent)` - Apply markup
- [x] `toStripeAmount(amount, currency)` - Convert to smallest unit
- [x] `fromStripeAmount(amount, currency)` - Convert from smallest unit
- [x] `getCurrencyConfig(country)` - SAR/EGP settings
- [x] `createPaymentIntent(amount, currency, metadata)` - Stripe helper
- [x] `confirmPaymentIntent(paymentIntentId)` - Verify payment

#### Utility Library: `src/lib/store-subscription.ts`

- [x] `handleFailedSubscription(subscriptionId)` - Add store credit on failure
- [x] `calculateAmountAfterCredit(price, storeCredit)` - Deduct credit
- [x] `useStoreCredit(customerId, amount)` - Deduct from balance

#### API Endpoints

- [x] **GET `/api/store/subscriptions`**
  - [x] List available subscription packages
  - [x] Apply markup to prices
  - [x] Return packages with customer prices

- [x] **POST `/api/store/subscriptions/start`**
  - [x] Require authentication
  - [x] Validate card number
  - [x] Create StoreSubscription record
  - [x] Create Operation record (links to worker)
  - [x] Set status to PENDING
  - [x] Worker will fetch packages from beIN
  - [x] Return subscription ID

- [x] **GET `/api/store/subscriptions/[id]`**
  - [x] Require authentication
  - [x] Verify ownership
  - [x] Return current status
  - [x] If AWAITING_PACKAGE: return packages with markup
  - [x] If AWAITING_CAPTCHA: indicate captcha needed
  - [x] Include operation progress

- [x] **POST `/api/store/subscriptions/[id]/select-package`**
  - [x] Require authentication
  - [x] Validate package selection
  - [x] Calculate final price (beIN + markup)
  - [x] Check store credit balance
  - [x] Deduct store credit if available
  - [x] Create Stripe PaymentIntent for remaining amount
  - [x] Save paymentIntentId to subscription
  - [x] Update status to AWAITING_PAYMENT
  - [x] Return Stripe clientSecret

- [x] **POST `/api/store/subscriptions/[id]/confirm-payment`**
  - [x] Require authentication
  - [x] Receive Stripe payment confirmation
  - [x] Verify payment succeeded with Stripe API
  - [x] Create Payment record
  - [x] Update subscription status to PAID
  - [x] Signal worker to continue operation
  - [x] Return success

- [x] **GET `/api/store/subscriptions/[id]/captcha`**
  - [x] Require authentication
  - [x] Check status is AWAITING_CAPTCHA
  - [x] Get captcha image from Operation
  - [x] Return base64 captcha image

- [x] **POST `/api/store/subscriptions/[id]/captcha`**
  - [x] Require authentication
  - [x] Validate captcha solution
  - [x] Submit to worker/operation
  - [x] Update status (PROCESSING or next step)

- [x] **POST `/api/store/subscriptions/[id]/confirm`**
  - [x] Require authentication
  - [x] Handle final confirmation step
  - [x] Signal worker to complete
  - [x] Update status

- [x] **POST `/api/store/subscriptions/[id]/cancel`**
  - [x] Require authentication
  - [x] Check if cancellable (PENDING, AWAITING_*)
  - [x] Cancel Stripe PaymentIntent if exists
  - [x] Refund store credit if used
  - [x] Update status to CANCELLED
  - [x] Cancel operation if in progress

- [x] **GET `/api/store/subscriptions/history`**
  - [x] Require authentication
  - [x] List customer's subscriptions
  - [x] Pagination
  - [x] Include status and result

### 2.8 Orders API (`/api/store/orders/*`)

- [ ] **GET `/api/store/orders`**
  - [ ] Require authentication
  - [ ] List customer's orders
  - [ ] Pagination
  - [ ] Filter by status
  - [ ] Sort by date (newest first)
  - [ ] Include items summary

- [ ] **POST `/api/store/orders`**
  - [ ] Require authentication
  - [ ] Validate cart items
  - [ ] Verify stock availability
  - [ ] Calculate totals (subtotal, shipping, discount)
  - [ ] Get/create shipping address
  - [ ] Generate order number
  - [ ] Create Stripe PaymentIntent
  - [ ] Create Order and OrderItems
  - [ ] Return order with Stripe clientSecret

- [ ] **GET `/api/store/orders/[id]`**
  - [ ] Require authentication
  - [ ] Verify ownership
  - [ ] Return full order details
  - [ ] Include all items
  - [ ] Include payment info
  - [ ] Include shipping address

- [ ] **POST `/api/store/orders/[id]/cancel`**
  - [ ] Require authentication
  - [ ] Check if cancellable (PENDING, PAID)
  - [ ] Cancel Stripe PaymentIntent or refund
  - [ ] Restore product stock
  - [ ] Update status to CANCELLED

### 2.9 Stripe Webhook (`/api/store/webhooks/stripe`)

- [ ] **POST `/api/store/webhooks/stripe`**
  - [ ] Verify Stripe signature
  - [ ] Handle `payment_intent.succeeded`
    - [ ] Find order/subscription by paymentIntentId
    - [ ] Update payment status
    - [ ] Continue flow if not already confirmed
  - [ ] Handle `payment_intent.payment_failed`
    - [ ] Update payment status
    - [ ] Log failure reason
  - [ ] Handle `charge.refunded`
    - [ ] Update payment status
    - [ ] Update order/subscription status

### 2.10 Install Dependencies

- [x] `npm install stripe` - Stripe SDK
- [ ] `npm install @stripe/stripe-js` - (for client-side if needed)

### 2.11 Commit Checkpoints

- [x] Commit: `feat(store): add auth API endpoints`
- [x] Commit: `feat(store): add products and categories API`
- [x] Commit: `feat(store): add subscriptions API with Stripe flow`
- [ ] Commit: `feat(store): add orders API`
- [ ] Commit: `feat(store): add Stripe webhook handler`

---

## Phase 3: Admin Panel Store Section (Week 3)

### 3.1 Layout and Navigation

- [ ] **Update Admin Sidebar**
  - [ ] Add "Store" section with icon
  - [ ] Add submenu items:
    - [ ] Dashboard
    - [ ] Products
    - [ ] Categories
    - [ ] Orders
    - [ ] Subscriptions
    - [ ] Customers
    - [ ] Shipping
    - [ ] Settings

- [ ] **Create Store Layout**
  - [ ] `src/app/dashboard/admin/store/layout.tsx`
  - [ ] Submenu navigation
  - [ ] Breadcrumbs

### 3.2 Store Dashboard (`/dashboard/admin/store`)

- [ ] **Dashboard Page**
  - [ ] `src/app/dashboard/admin/store/page.tsx`
  - [ ] Revenue stats (today, week, month)
  - [ ] Orders count by status
  - [ ] Subscriptions count by status
  - [ ] Recent orders table
  - [ ] Recent subscriptions table
  - [ ] Low stock alerts
  - [ ] Top selling products chart

### 3.3 Products Management (`/dashboard/admin/store/products`)

- [ ] **Products List Page**
  - [ ] `src/app/dashboard/admin/store/products/page.tsx`
  - [ ] Data table with:
    - [ ] Image thumbnail
    - [ ] Name (EN/AR)
    - [ ] Category
    - [ ] Price (SAR/EGP)
    - [ ] Stock
    - [ ] Status (active/inactive)
    - [ ] Actions (edit, delete, toggle)
  - [ ] Filters (category, status, stock)
  - [ ] Search
  - [ ] Bulk actions (activate, deactivate, delete)
  - [ ] Add new product button

- [ ] **Product Form (Add/Edit)**
  - [ ] `src/app/dashboard/admin/store/products/[id]/page.tsx`
  - [ ] `src/app/dashboard/admin/store/products/new/page.tsx`
  - [ ] Form fields:
    - [ ] Name (EN/AR)
    - [ ] Description (EN/AR)
    - [ ] Category dropdown
    - [ ] SKU
    - [ ] Price SAR / Price EGP
    - [ ] Compare prices (for discounts)
    - [ ] Stock quantity
    - [ ] Images upload (multiple)
    - [ ] Specifications (key-value pairs)
    - [ ] Featured toggle
    - [ ] Active toggle
  - [ ] Image upload/preview
  - [ ] Validation
  - [ ] Save/Cancel buttons

- [ ] **Products API (Admin)**
  - [ ] `src/app/api/admin/store/products/route.ts` (GET, POST)
  - [ ] `src/app/api/admin/store/products/[id]/route.ts` (GET, PUT, DELETE)
  - [ ] Image upload endpoint

### 3.4 Categories Management (`/dashboard/admin/store/categories`)

- [ ] **Categories Page**
  - [ ] `src/app/dashboard/admin/store/categories/page.tsx`
  - [ ] Data table with:
    - [ ] Image
    - [ ] Name (EN/AR)
    - [ ] Product count
    - [ ] Sort order
    - [ ] Status
    - [ ] Actions
  - [ ] Inline add new category
  - [ ] Drag to reorder
  - [ ] Edit modal/drawer

- [ ] **Categories API (Admin)**
  - [ ] `src/app/api/admin/store/categories/route.ts`
  - [ ] `src/app/api/admin/store/categories/[id]/route.ts`

### 3.5 Orders Management (`/dashboard/admin/store/orders`)

- [ ] **Orders List Page**
  - [ ] `src/app/dashboard/admin/store/orders/page.tsx`
  - [ ] Data table with:
    - [ ] Order number
    - [ ] Customer name/email
    - [ ] Items count
    - [ ] Total
    - [ ] Status badge
    - [ ] Date
    - [ ] Actions
  - [ ] Filters (status, date range, customer)
  - [ ] Search by order number
  - [ ] Export to CSV

- [ ] **Order Details Page**
  - [ ] `src/app/dashboard/admin/store/orders/[id]/page.tsx`
  - [ ] Order summary
  - [ ] Items list with images
  - [ ] Customer info
  - [ ] Shipping address
  - [ ] Payment info
  - [ ] Status timeline
  - [ ] Actions:
    - [ ] Update status dropdown
    - [ ] Add tracking number
    - [ ] Print order
    - [ ] Refund button
    - [ ] Cancel order

- [ ] **Orders API (Admin)**
  - [ ] `src/app/api/admin/store/orders/route.ts`
  - [ ] `src/app/api/admin/store/orders/[id]/route.ts`
  - [ ] `src/app/api/admin/store/orders/[id]/status/route.ts`
  - [ ] `src/app/api/admin/store/orders/[id]/refund/route.ts`

### 3.6 Subscriptions Management (`/dashboard/admin/store/subscriptions`)

- [ ] **Subscriptions List Page**
  - [ ] `src/app/dashboard/admin/store/subscriptions/page.tsx`
  - [ ] Data table with:
    - [ ] ID
    - [ ] Customer
    - [ ] Card number (masked)
    - [ ] Package name
    - [ ] Price
    - [ ] Status badge
    - [ ] Date
    - [ ] Actions
  - [ ] Filters (status, date)
  - [ ] Search by card number

- [ ] **Subscription Details Modal/Page**
  - [ ] View linked Operation
  - [ ] See captcha history
  - [ ] Status timeline
  - [ ] Refund action
  - [ ] Manual complete (if stuck)

- [ ] **Subscriptions API (Admin)**
  - [ ] `src/app/api/admin/store/subscriptions/route.ts`
  - [ ] `src/app/api/admin/store/subscriptions/[id]/route.ts`
  - [ ] `src/app/api/admin/store/subscriptions/[id]/refund/route.ts`

### 3.7 Customers Management (`/dashboard/admin/store/customers`)

- [ ] **Customers List Page**
  - [ ] `src/app/dashboard/admin/store/customers/page.tsx`
  - [ ] Data table with:
    - [ ] Name
    - [ ] Email
    - [ ] Phone
    - [ ] Country
    - [ ] Orders count
    - [ ] Store credit
    - [ ] Status (verified, active)
    - [ ] Joined date
    - [ ] Actions
  - [ ] Filters (country, status)
  - [ ] Search

- [ ] **Customer Details Page**
  - [ ] `src/app/dashboard/admin/store/customers/[id]/page.tsx`
  - [ ] Profile info
  - [ ] Addresses list
  - [ ] Orders history
  - [ ] Subscriptions history
  - [ ] Store credit management:
    - [ ] View balance
    - [ ] Add credit manually
    - [ ] Credit history
  - [ ] Actions:
    - [ ] Activate/Deactivate
    - [ ] Reset password
    - [ ] Verify email manually

- [ ] **Customers API (Admin)**
  - [ ] `src/app/api/admin/store/customers/route.ts`
  - [ ] `src/app/api/admin/store/customers/[id]/route.ts`
  - [ ] `src/app/api/admin/store/customers/[id]/credit/route.ts`

### 3.8 Shipping Management (`/dashboard/admin/store/shipping`)

- [ ] **Shipping Regions Page**
  - [ ] `src/app/dashboard/admin/store/shipping/page.tsx`
  - [ ] Data table with:
    - [ ] Country
    - [ ] City (EN/AR)
    - [ ] Cost SAR
    - [ ] Cost EGP
    - [ ] Est. days
    - [ ] Status
    - [ ] Actions
  - [ ] Group by country
  - [ ] Inline add new region
  - [ ] Bulk edit costs

- [ ] **Shipping API (Admin)**
  - [ ] `src/app/api/admin/store/shipping/route.ts`
  - [ ] `src/app/api/admin/store/shipping/[id]/route.ts`

### 3.9 Store Settings (`/dashboard/admin/store/settings`)

- [ ] **Settings Page**
  - [ ] `src/app/dashboard/admin/store/settings/page.tsx`
  - [ ] Sections:
    - [ ] **General**
      - [ ] Store name (EN/AR)
      - [ ] Enable/Disable store
      - [ ] Contact email
      - [ ] Support phones (SA/EG)
    - [ ] **Pricing**
      - [ ] Markup percentage
      - [ ] Minimum order amount
      - [ ] Minimum subscription amount
    - [ ] **Stripe**
      - [ ] Publishable key
      - [ ] Secret key (masked input)
      - [ ] Webhook secret
      - [ ] Test connection button
    - [ ] **Notifications**
      - [ ] Order notification email
      - [ ] Low stock threshold

- [ ] **Settings API (Admin)**
  - [ ] `src/app/api/admin/store/settings/route.ts`

### 3.10 Components

- [ ] `src/components/admin/store/StoreDashboard.tsx`
- [ ] `src/components/admin/store/StoreStats.tsx`
- [ ] `src/components/admin/store/ProductsTable.tsx`
- [ ] `src/components/admin/store/ProductForm.tsx`
- [ ] `src/components/admin/store/CategoriesTable.tsx`
- [ ] `src/components/admin/store/CategoryForm.tsx`
- [ ] `src/components/admin/store/OrdersTable.tsx`
- [ ] `src/components/admin/store/OrderDetails.tsx`
- [ ] `src/components/admin/store/OrderStatusBadge.tsx`
- [ ] `src/components/admin/store/OrderTimeline.tsx`
- [ ] `src/components/admin/store/SubscriptionsTable.tsx`
- [ ] `src/components/admin/store/SubscriptionDetails.tsx`
- [ ] `src/components/admin/store/CustomersTable.tsx`
- [ ] `src/components/admin/store/CustomerDetails.tsx`
- [ ] `src/components/admin/store/ShippingTable.tsx`
- [ ] `src/components/admin/store/ShippingForm.tsx`
- [ ] `src/components/admin/store/StoreSettingsForm.tsx`

### 3.11 Commit Checkpoints

- [ ] Commit: `feat(admin): add store dashboard`
- [ ] Commit: `feat(admin): add products management`
- [ ] Commit: `feat(admin): add categories management`
- [ ] Commit: `feat(admin): add orders management`
- [ ] Commit: `feat(admin): add subscriptions management`
- [ ] Commit: `feat(admin): add customers management`
- [ ] Commit: `feat(admin): add shipping management`
- [ ] Commit: `feat(admin): add store settings`

---

## Phase 4: Stripe Integration (Week 4)

### 4.1 Stripe Account Setup (User Task)

- [ ] Create Stripe account at stripe.com
- [ ] Complete business verification
- [ ] Enable SAR and EGP currencies
- [ ] Get API keys:
  - [ ] Test publishable key (pk_test_...)
  - [ ] Test secret key (sk_test_...)
  - [ ] Webhook signing secret (whsec_...)
- [ ] Add keys to StoreSetting table

### 4.2 Server-Side Integration

- [x] **Stripe Utility Library** (`src/lib/stripe.ts`)
  - [x] Initialize Stripe client
  - [x] Create PaymentIntent helper
  - [x] Confirm PaymentIntent helper
  - [x] Refund helper
  - [x] Cancel PaymentIntent helper

- [ ] **Currency Handling**
  - [x] SAR configuration (smallest unit = halalas)
  - [x] EGP configuration (smallest unit = piasters)
  - [x] Conversion functions

- [ ] **Webhook Handler**
  - [ ] Signature verification
  - [ ] Event type routing
  - [ ] Idempotency handling

### 4.3 Test Stripe Flow

- [ ] Test subscription payment flow
  - [ ] Create PaymentIntent
  - [ ] Simulate payment with test card
  - [ ] Verify webhook received
  - [ ] Check database updated

- [ ] Test order payment flow
  - [ ] Create PaymentIntent
  - [ ] Complete payment
  - [ ] Verify order status

- [ ] Test refund flow
  - [ ] Initiate refund from admin
  - [ ] Verify webhook
  - [ ] Check status updates

### 4.4 Commit Checkpoint

- [ ] Commit: `feat(store): complete Stripe integration`

---

## Phase 5: Flutter Mobile App (Week 5-8)

### 5.1 Project Setup

- [ ] **Create Flutter Project**
  - [ ] `flutter create desh_store_app`
  - [ ] Configure `pubspec.yaml` with dependencies
  - [ ] Set up folder structure

- [ ] **Dependencies to Install**
  ```yaml
  # State Management
  - provider: ^6.1.1
  
  # Networking
  - dio: ^5.4.0
  
  # Storage
  - flutter_secure_storage: ^9.0.0
  - shared_preferences: ^2.2.2
  
  # Payments
  - flutter_stripe: ^10.1.1
  
  # UI
  - cached_network_image: ^3.3.1
  - shimmer: ^3.0.0
  - carousel_slider: ^4.2.1
  
  # Forms
  - reactive_forms: ^17.0.1
  
  # Notifications
  - firebase_core: ^2.24.2
  - firebase_messaging: ^14.7.10
  ```

- [ ] **Configure Platforms**
  - [ ] iOS: Update Info.plist
  - [ ] Android: Update AndroidManifest.xml
  - [ ] Set minimum SDK versions

### 5.2 Core Infrastructure

- [ ] **API Client** (`lib/core/api/`)
  - [ ] Dio client setup
  - [ ] Base URL configuration
  - [ ] Auth interceptor (add JWT to requests)
  - [ ] Error interceptor
  - [ ] API endpoints constants

- [ ] **Storage** (`lib/core/storage/`)
  - [ ] Secure storage for tokens
  - [ ] Preferences for settings

- [ ] **Localization** (`lib/core/localization/`)
  - [ ] Arabic translations (ar.json)
  - [ ] English translations (en.json)
  - [ ] Localization delegate

- [ ] **Theme** (`lib/app/`)
  - [ ] Color scheme (beIN colors?)
  - [ ] Text styles
  - [ ] Component themes
  - [ ] RTL support

### 5.3 Authentication Feature (`lib/features/auth/`)

- [ ] **Splash Screen**
  - [ ] App logo
  - [ ] Check auth status
  - [ ] Navigate to Login or Home

- [ ] **Login Screen**
  - [ ] Email/phone input
  - [ ] Password input
  - [ ] Forgot password link
  - [ ] Login button
  - [ ] Register link
  - [ ] Social login (future)

- [ ] **Register Screen**
  - [ ] Name input
  - [ ] Email input
  - [ ] Phone input
  - [ ] Password input
  - [ ] Confirm password
  - [ ] Country selector
  - [ ] Terms checkbox
  - [ ] Register button

- [ ] **Verify Email Screen**
  - [ ] Instructions text
  - [ ] OTP/Token input
  - [ ] Resend button
  - [ ] Verify button

- [ ] **Forgot Password Screen**
  - [ ] Email input
  - [ ] Send reset button

- [ ] **Reset Password Screen**
  - [ ] New password input
  - [ ] Confirm password input
  - [ ] Reset button

- [ ] **Auth Provider**
  - [ ] Login method
  - [ ] Register method
  - [ ] Logout method
  - [ ] Check auth status
  - [ ] Token management

### 5.4 Home Feature (`lib/features/home/`)

- [ ] **Home Screen**
  - [ ] App bar with cart icon + badge
  - [ ] Search bar
  - [ ] Featured products carousel
  - [ ] Categories grid
  - [ ] Subscription banner/card
  - [ ] Products section
  - [ ] Bottom navigation

- [ ] **Widgets**
  - [ ] Featured carousel
  - [ ] Category card
  - [ ] Subscription promo card
  - [ ] Product card (grid/list)

### 5.5 Products Feature (`lib/features/products/`)

- [ ] **Products Screen**
  - [ ] Grid view
  - [ ] List view toggle
  - [ ] Filter drawer
  - [ ] Sort options
  - [ ] Pagination/infinite scroll

- [ ] **Product Detail Screen**
  - [ ] Image gallery/carousel
  - [ ] Name and price
  - [ ] Description
  - [ ] Specifications
  - [ ] Stock status
  - [ ] Quantity selector
  - [ ] Add to cart button
  - [ ] Related products

- [ ] **Category Products Screen**
  - [ ] Category header
  - [ ] Products grid
  - [ ] Filters

- [ ] **Products Provider**
  - [ ] Fetch products
  - [ ] Fetch single product
  - [ ] Search products
  - [ ] Filter/sort

### 5.6 Subscriptions Feature (`lib/features/subscriptions/`)

- [ ] **Enter Card Screen (Step 1)**
  - [ ] beIN card number input
  - [ ] Card number validation
  - [ ] Continue button
  - [ ] Info/help text

- [ ] **Loading Packages Screen (Step 2)**
  - [ ] Loading animation
  - [ ] Status text
  - [ ] Cancel button
  - [ ] Auto-navigate when ready

- [ ] **Select Package Screen (Step 3)**
  - [ ] List of packages
  - [ ] Package cards with:
    - [ ] Name
    - [ ] Duration
    - [ ] beIN price (crossed out)
    - [ ] Customer price (with markup)
    - [ ] Features
  - [ ] Select button
  - [ ] Store credit display (if available)

- [ ] **Payment Screen (Step 4)**
  - [ ] Order summary
  - [ ] Price breakdown:
    - [ ] Package price
    - [ ] Store credit used
    - [ ] Amount to pay
  - [ ] Stripe payment sheet
  - [ ] Pay button
  - [ ] Processing state

- [ ] **Captcha Screen (Step 5)**
  - [ ] Captcha image display
  - [ ] Solution input
  - [ ] Refresh captcha button
  - [ ] Submit button
  - [ ] Timeout indicator

- [ ] **Confirm Screen (Step 6)**
  - [ ] Confirmation message
  - [ ] Confirm button
  - [ ] Loading state

- [ ] **Result Screen (Step 7)**
  - [ ] Success state:
    - [ ] Success animation
    - [ ] Subscription details
    - [ ] Done button
  - [ ] Failed state:
    - [ ] Error message
    - [ ] Store credit added notice
    - [ ] Retry button
    - [ ] Contact support

- [ ] **Subscription History Screen**
  - [ ] List of past subscriptions
  - [ ] Status badges
  - [ ] Filter by status
  - [ ] View details

- [ ] **Subscription Provider**
  - [ ] Start subscription
  - [ ] Poll status
  - [ ] Select package
  - [ ] Process payment
  - [ ] Submit captcha
  - [ ] Confirm
  - [ ] Cancel
  - [ ] Fetch history

### 5.7 Cart Feature (`lib/features/cart/`)

- [ ] **Cart Screen**
  - [ ] List of cart items
  - [ ] Quantity +/- buttons
  - [ ] Remove item button
  - [ ] Clear cart button
  - [ ] Subtotal
  - [ ] Checkout button
  - [ ] Empty state

- [ ] **Cart Provider**
  - [ ] Add to cart
  - [ ] Remove from cart
  - [ ] Update quantity
  - [ ] Clear cart
  - [ ] Calculate totals
  - [ ] Persist cart locally

### 5.8 Checkout Feature (`lib/features/checkout/`)

- [ ] **Checkout Screen**
  - [ ] Order summary
  - [ ] Address selection
  - [ ] Shipping cost display
  - [ ] Total calculation
  - [ ] Continue to payment

- [ ] **Shipping Screen**
  - [ ] Select saved address
  - [ ] Add new address form
  - [ ] Shipping options (if multiple)

- [ ] **Payment Screen**
  - [ ] Order summary
  - [ ] Stripe payment sheet
  - [ ] Pay button
  - [ ] Processing state

- [ ] **Order Success Screen**
  - [ ] Success animation
  - [ ] Order number
  - [ ] Estimated delivery
  - [ ] View order button
  - [ ] Continue shopping button

- [ ] **Checkout Provider**
  - [ ] Set address
  - [ ] Calculate shipping
  - [ ] Create order
  - [ ] Process payment
  - [ ] Handle success/failure

### 5.9 Orders Feature (`lib/features/orders/`)

- [ ] **Orders Screen**
  - [ ] List of orders
  - [ ] Order cards with:
    - [ ] Order number
    - [ ] Date
    - [ ] Status badge
    - [ ] Total
    - [ ] Items preview
  - [ ] Filter by status
  - [ ] Empty state

- [ ] **Order Detail Screen**
  - [ ] Order info
  - [ ] Status timeline
  - [ ] Items list with images
  - [ ] Shipping address
  - [ ] Tracking info (if shipped)
  - [ ] Cancel button (if pending)
  - [ ] Contact support

- [ ] **Orders Provider**
  - [ ] Fetch orders
  - [ ] Fetch single order
  - [ ] Cancel order

### 5.10 Profile Feature (`lib/features/profile/`)

- [ ] **Profile Screen**
  - [ ] User info header
  - [ ] Store credit balance
  - [ ] Menu items:
    - [ ] Edit Profile
    - [ ] My Addresses
    - [ ] My Orders
    - [ ] My Subscriptions
    - [ ] Change Password
    - [ ] Language
    - [ ] Notifications
    - [ ] Help & Support
    - [ ] About
    - [ ] Logout

- [ ] **Edit Profile Screen**
  - [ ] Name input
  - [ ] Email (read-only)
  - [ ] Phone input
  - [ ] Save button

- [ ] **Addresses Screen**
  - [ ] List of addresses
  - [ ] Add new address button
  - [ ] Edit/Delete actions
  - [ ] Set default

- [ ] **Change Password Screen**
  - [ ] Current password
  - [ ] New password
  - [ ] Confirm password
  - [ ] Save button

- [ ] **Settings Screen**
  - [ ] Language selector
  - [ ] Notifications toggle
  - [ ] Theme (if applicable)

### 5.11 Shared Widgets (`lib/shared/widgets/`)

- [ ] AppButton (primary, secondary, outlined)
- [ ] AppTextField (with validation)
- [ ] AppBar (with back, cart, search)
- [ ] LoadingIndicator
- [ ] ErrorWidget (retry button)
- [ ] EmptyState
- [ ] NetworkImage (with placeholder)
- [ ] PriceText (with currency)
- [ ] StatusBadge

### 5.12 Commit Checkpoints

- [ ] Commit: `feat(flutter): project setup and core infrastructure`
- [ ] Commit: `feat(flutter): implement auth screens`
- [ ] Commit: `feat(flutter): implement home and products`
- [ ] Commit: `feat(flutter): implement subscription flow`
- [ ] Commit: `feat(flutter): implement cart and checkout`
- [ ] Commit: `feat(flutter): implement orders and profile`

---

## Phase 6: Testing & Deployment (Week 9-10)

### 6.1 Backend Testing

- [ ] **API Tests**
  - [ ] Auth endpoints
  - [ ] Products endpoints
  - [ ] Subscriptions endpoints
  - [ ] Orders endpoints
  - [ ] Webhook handling

- [ ] **Integration Tests**
  - [ ] Full subscription flow
  - [ ] Full order flow
  - [ ] Payment processing
  - [ ] Store credit handling

### 6.2 Admin Panel Testing

- [ ] Products CRUD
- [ ] Categories CRUD
- [ ] Orders management
- [ ] Subscriptions management
- [ ] Customer management
- [ ] Settings save/load

### 6.3 Flutter App Testing

- [ ] **UI Testing**
  - [ ] All screens render correctly
  - [ ] RTL layout works
  - [ ] Arabic translations complete
  - [ ] Responsive on different devices

- [ ] **Flow Testing**
  - [ ] Registration → Verification → Login
  - [ ] Browse → Add to Cart → Checkout → Payment
  - [ ] Enter Card → Select Package → Pay → Captcha → Complete
  - [ ] View Orders/Subscriptions history

- [ ] **Edge Cases**
  - [ ] Network errors
  - [ ] Session expiry
  - [ ] Empty states
  - [ ] Validation errors

### 6.4 Production Preparation

- [ ] **Backend**
  - [ ] Switch Stripe to live mode
  - [ ] Update API URLs
  - [ ] Configure production environment
  - [ ] Set up monitoring/logging

- [ ] **Flutter App**
  - [ ] Update API base URL
  - [ ] Configure Stripe publishable key
  - [ ] Build release versions

### 6.5 App Store Submission

- [ ] **Apple App Store**
  - [ ] Apple Developer account ($99/year)
  - [ ] Create App Store Connect app
  - [ ] Screenshots (iPhone, iPad)
  - [ ] App description (EN/AR)
  - [ ] Privacy policy
  - [ ] Build and upload IPA
  - [ ] Submit for review
  - [ ] Address review feedback

- [ ] **Google Play Store**
  - [ ] Google Play Developer account ($25)
  - [ ] Create Play Console app
  - [ ] Screenshots (phone, tablet)
  - [ ] Store listing (EN/AR)
  - [ ] Privacy policy
  - [ ] Build and upload AAB
  - [ ] Submit for review
  - [ ] Monitor for issues

### 6.6 Post-Launch

- [ ] Monitor error logs
- [ ] Track analytics
- [ ] Gather user feedback
- [ ] Plan updates

---

## Environment Variables Checklist

### Backend (.env)

```env
# Existing variables...

# Stripe (add to StoreSetting table instead)
STRIPE_SECRET_KEY=sk_...
STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email (for verification)
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=

# Store JWT
STORE_JWT_SECRET=
```

### Flutter App

```dart
// lib/core/config.dart
const apiBaseUrl = 'https://your-api.com/api/store';
const stripePublishableKey = 'pk_...';
```

---

## User Tasks (Parallel)

These tasks should be done by the user while development continues:

- [ ] Set up Stripe account at stripe.com
- [ ] Complete Stripe business verification
- [ ] Set up Apple Developer account ($99/year)
- [ ] Set up Google Play Developer account ($25)
- [ ] Prepare app icons and splash screens
- [ ] Write privacy policy
- [ ] Prepare app store descriptions (EN/AR)
- [ ] Take screenshots for app stores

---

## Progress Summary

| Phase | Status | Progress |
|-------|--------|----------|
| Phase 1: Database | ✅ Complete | 100% |
| Phase 2: API Routes | 🔄 In Progress | 85% |
| Phase 3: Admin Panel | ⏳ Pending | 0% |
| Phase 4: Stripe | 🔄 Partial | 50% |
| Phase 5: Flutter App | ⏳ Pending | 0% |
| Phase 6: Testing | ⏳ Pending | 0% |

---

*Last Updated: January 30, 2026*
