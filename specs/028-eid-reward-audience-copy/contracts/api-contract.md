# API Contract: Eid Reward Audience And Copy

## GET /api/admin/eid-rewards/settings

**Authorization**: exact admin role.

**Response additions**:

```json
{
  "settings": {
    "audienceRoles": ["ADMIN", "MANAGER", "AGENT", "USER"],
    "popupTexts": {
      "title": "string",
      "beforeText": "string",
      "openButtonText": "string",
      "openingText": "string",
      "successTitle": "string",
      "pointsText": "string",
      "moneyPreviewText": "string",
      "afterText": "string",
      "redeemButtonText": "string",
      "redeemingText": "string",
      "redeemedSuccessText": "string",
      "laterButtonText": "string",
      "alreadyClaimedText": "string",
      "claimedTodayText": "string",
      "inactiveEventText": "string",
      "genericErrorText": "string"
    },
    "audienceOverrides": [
      {
        "userId": "string",
        "effect": "ALLOW",
        "user": {
          "id": "string",
          "username": "string",
          "email": "string",
          "role": "USER",
          "isActive": true
        }
      }
    ]
  }
}
```

**Rules**:

- Return safe user fields only.
- Do not return passwords, sessions, tokens, or deleted sensitive data.
- Normalize missing `popupTexts` before returning.

## PUT /api/admin/eid-rewards/settings

**Authorization**: exact admin role.

**Request additions**:

```json
{
  "audienceRoles": ["ADMIN", "MANAGER", "AGENT", "USER"],
  "popupTexts": {
    "title": "string",
    "beforeText": "string",
    "openButtonText": "string",
    "openingText": "string",
    "successTitle": "string",
    "pointsText": "You received {points} points",
    "moneyPreviewText": "Equals {amount} {currency} balance",
    "afterText": "string",
    "redeemButtonText": "string",
    "redeemingText": "string",
    "redeemedSuccessText": "string",
    "laterButtonText": "string",
    "alreadyClaimedText": "string",
    "claimedTodayText": "string",
    "inactiveEventText": "string",
    "genericErrorText": "string"
  },
  "audienceOverrides": [
    {
      "userId": "string",
      "effect": "DENY"
    }
  ]
}
```

**Validation**:

- `audienceRoles` contains only known roles.
- `audienceOverrides` contains existing users only.
- One override per user.
- `effect` is `ALLOW` or `DENY`.
- Required text fields are non-empty after trimming.
- Text length limits are enforced.
- Unsupported placeholders are rejected.

**Save behavior**:

- Settings, audience roles, popup text, and overrides save in one transaction.
- On validation failure, previous settings remain unchanged.
- `beforeText` and `afterText` are kept aligned with the text bundle.

## GET /api/eid-rewards/status

**Authorization**: authenticated user.

**Response additions**:

```json
{
  "eligible": true,
  "audienceEligible": true,
  "popup": {
    "show": true,
    "allowLaterDismiss": true,
    "closeDelaySeconds": 0,
    "texts": {
      "title": "string",
      "beforeText": "string",
      "openButtonText": "string",
      "openingText": "string",
      "successTitle": "string",
      "pointsText": "string",
      "moneyPreviewText": "string",
      "afterText": "string",
      "redeemButtonText": "string",
      "redeemingText": "string",
      "redeemedSuccessText": "string",
      "laterButtonText": "string",
      "alreadyClaimedText": "string",
      "claimedTodayText": "string",
      "inactiveEventText": "string",
      "genericErrorText": "string"
    }
  }
}
```

**Rules**:

- If the user is outside the audience, `eligible` is false and `popup.show` is false.
- Do not return `audienceRoles`.
- Do not return user override lists.
- Do not expose probability weights or internal settings rules.

## POST /api/eid-rewards/claim

**Authorization**: authenticated user.

**Audience failure response**:

```json
{
  "error": "NOT_ELIGIBLE_AUDIENCE",
  "message": "Reward is not available for this account."
}
```

**Rules**:

- Audience check happens before creating `EidRewardClaim`.
- Audience check happens before creating `PointLedgerEntry`.
- Existing success response shape stays compatible for eligible users.
- Claim success messages should use the normalized popup text templates where visible to the user.
