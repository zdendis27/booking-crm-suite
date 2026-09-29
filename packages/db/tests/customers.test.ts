import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createDb, createUser, type Db } from "./support/harness";

let db: Db;
let alice: string;
let bob: string;
let aliceAccount: string;

beforeAll(async () => {
  db = await createDb();
  alice = await createUser(db, "alice@example.cz");
  bob = await createUser(db, "bob@example.cz");
  aliceAccount = (
    await db.query<{ id: string }>("select id from public.customer_accounts where user_id = $1", [alice])
  ).rows[0]!.id;
});

afterAll(async () => {
  await db.close();
});

describe("zákaznický účet", () => {
  it("vznikne automaticky s ověřeným e-mailem", async () => {
    const row = await db.query<{ email_verified_at: string | null }>(
      "select email_verified_at from public.customer_accounts where id = $1",
      [aliceAccount],
    );
    expect(row.rows[0]!.email_verified_at).not.toBeNull();
  });

  it("zákazník vidí jen svůj účet", async () => {
    const rows = await asUser(db, alice, (tx) => tx.query("select id from public.customer_accounts"));
    expect(rows.rows).toHaveLength(1);
  });

  it("zákazník si nemůže sám nastavit ověřený telefon", async () => {
    await expect(
      asUser(db, alice, (tx) =>
        tx.query("update public.customer_accounts set phone_verified_at = now() where user_id = $1", [alice]),
      ),
    ).rejects.toThrow(/forbidden_column_change/);
  });

  it("změna telefonu zruší ověření", async () => {
    await db.query(
      "update public.customer_accounts set phone = '+420777111222', phone_verified_at = now() where id = $1",
      [aliceAccount],
    );
    await asUser(db, alice, (tx) =>
      tx.query("update public.customer_accounts set phone = '+420777333444' where user_id = $1", [alice]),
    );
    const row = await db.query<{ phone_verified_at: string | null }>(
      "select phone_verified_at from public.customer_accounts where id = $1",
      [aliceAccount],
    );
    expect(row.rows[0]!.phone_verified_at).toBeNull();
  });

  it("zahraniční čísla jsou odmítnuta", async () => {
    await expect(
      db.query("update public.customer_accounts set phone = '+4915112345678' where id = $1", [aliceAccount]),
    ).rejects.toThrow();
  });
});

describe("ověřování kódem", () => {
  it("běžný uživatel nemůže volat ověřovací funkce", async () => {
    await expect(
      asUser(db, alice, (tx) =>
        tx.query("select public.issue_verification($1, 'sms', '+420777000111', 'hash')", [aliceAccount]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("správný kód ověří telefon", async () => {
    await asService(db, (tx) =>
      tx.query("select public.issue_verification($1, 'sms', '+420777000111', 'h-ok', 'ip-1')", [aliceAccount]),
    );
    const ok = await asService(db, (tx) =>
      tx.query<{ confirm_verification: boolean }>(
        "select public.confirm_verification($1, 'sms', '+420777000111', 'h-ok')",
        [aliceAccount],
      ),
    );
    expect(ok.rows[0]!.confirm_verification).toBe(true);
    const row = await db.query<{ phone: string; phone_verified_at: string | null }>(
      "select phone, phone_verified_at from public.customer_accounts where id = $1",
      [aliceAccount],
    );
    expect(row.rows[0]!.phone).toBe("+420777000111");
    expect(row.rows[0]!.phone_verified_at).not.toBeNull();
  });

  it("špatný kód se odmítne a po pěti pokusech se zablokuje", async () => {
    const bobAccount = (
      await db.query<{ id: string }>("select id from public.customer_accounts where user_id = $1", [bob])
    ).rows[0]!.id;
    await asService(db, (tx) =>
      tx.query("select public.issue_verification($1, 'sms', '+421905111222', 'right')", [bobAccount]),
    );
    for (let i = 0; i < 5; i++) {
      const bad = await asService(db, (tx) =>
        tx.query<{ confirm_verification: boolean }>(
          "select public.confirm_verification($1, 'sms', '+421905111222', 'wrong')",
          [bobAccount],
        ),
      );
      expect(bad.rows[0]!.confirm_verification).toBe(false);
    }
    await expect(
      asService(db, (tx) => tx.query("select public.confirm_verification($1, 'sms', '+421905111222', 'right')", [bobAccount])),
    ).rejects.toThrow(/too_many_attempts/);
  });

  it("druhé odeslání do 60 sekund je odmítnuto", async () => {
    const carol = await createUser(db, "carol@example.cz");
    const account = (
      await db.query<{ id: string }>("select id from public.customer_accounts where user_id = $1", [carol])
    ).rows[0]!.id;
    await asService(db, (tx) =>
      tx.query("select public.issue_verification($1, 'sms', '+420602111111', 'a')", [account]),
    );
    await expect(
      asService(db, (tx) => tx.query("select public.issue_verification($1, 'sms', '+420602111111', 'b')", [account])),
    ).rejects.toThrow(/rate_limited/);
  });

  it("nepovolené předvolby se odmítnou", async () => {
    await expect(
      asService(db, (tx) => tx.query("select public.issue_verification($1, 'sms', '+4915112345678', 'x')", [aliceAccount])),
    ).rejects.toThrow(/invalid_phone/);
  });

  it("denní rozpočet SMS chrání platformu", async () => {
    await db.query("update public.platform_settings set value = '0' where key = 'sms_daily_budget'");
    const dave = await createUser(db, "dave@example.cz");
    const account = (
      await db.query<{ id: string }>("select id from public.customer_accounts where user_id = $1", [dave])
    ).rows[0]!.id;
    await expect(
      asService(db, (tx) => tx.query("select public.issue_verification($1, 'sms', '+420603000000', 'x')", [account])),
    ).rejects.toThrow(/sms_budget_exceeded/);
    await db.query("update public.platform_settings set value = '300' where key = 'sms_daily_budget'");
  });
});
