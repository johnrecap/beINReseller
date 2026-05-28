# Contract: Bulk Proxy Import

## Admin API: Preview Bulk Import

### Endpoint

`POST /api/admin/proxies/import`

### Mode

`mode: "preview"`

### Request

```json
{
  "mode": "preview",
  "text": "5.59.255.175:6567:exuirjdu:q91cpyieogqb\n45.56.155.26:6557:exuirjdu:q91cpyieogqb",
  "labelPrefix": "بروكسي",
  "isActive": true
}
```

### Response

```json
{
  "success": true,
  "summary": {
    "totalLines": 2,
    "blankLines": 0,
    "validCount": 2,
    "duplicateCount": 0,
    "invalidCount": 0,
    "nextLabelStart": 1
  },
  "validRows": [
    {
      "lineNumber": 1,
      "host": "5.59.255.175",
      "port": 6567,
      "username": "exuirjdu",
      "hasPassword": true,
      "label": "بروكسي 1"
    }
  ],
  "duplicates": [],
  "invalidRows": []
}
```

## Admin API: Commit Bulk Import

### Endpoint

`POST /api/admin/proxies/import`

### Mode

`mode: "commit"`

### Response

```json
{
  "success": true,
  "summary": {
    "totalLines": 50,
    "importedCount": 50,
    "duplicateCount": 0,
    "invalidCount": 0
  },
  "createdProxies": [
    {
      "id": "proxy_id",
      "host": "5.59.255.175",
      "port": 6567,
      "username": "exuirjdu",
      "hasPassword": true,
      "label": "بروكسي 1",
      "isActive": true,
      "accountsCount": 0
    }
  ],
  "duplicates": [],
  "invalidRows": []
}
```

## Validation Errors

Invalid row example:

```json
{
  "lineNumber": 7,
  "rawLine": "bad-row",
  "reason": "Expected host:port or host:port:username:password"
}
```

Duplicate row example:

```json
{
  "lineNumber": 12,
  "host": "5.59.255.175",
  "port": 6567,
  "reason": "Duplicate host and port"
}
```

## Security Rules

- Endpoint requires ADMIN.
- Plaintext passwords are accepted only in the request body and are encrypted before persistence.
- Plaintext passwords are never returned in preview or commit responses.
- Server-side validation is authoritative.
