DO $$
DECLARE
    duplicate_group_count INTEGER;
BEGIN
    SELECT count(*)
    INTO duplicate_group_count
    FROM (
        SELECT lower(btrim("username")) AS canonical_username
        FROM "bein_accounts"
        GROUP BY lower(btrim("username"))
        HAVING count(*) > 1
    ) aliases;

    IF duplicate_group_count > 0 THEN
        RAISE EXCEPTION
            'Cannot canonicalize beIN account identities; % case/whitespace alias group(s) require secure manual consolidation before deploy',
            duplicate_group_count;
    END IF;
END $$;

ALTER TABLE "bein_accounts"
    ADD CONSTRAINT "bein_accounts_username_nonblank"
    CHECK (length(btrim("username")) > 0);

CREATE UNIQUE INDEX "bein_accounts_username_canonical_key"
    ON "bein_accounts" (lower(btrim("username")));
