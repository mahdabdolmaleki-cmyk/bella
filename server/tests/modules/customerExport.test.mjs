// Admin XLSX customer export and notification-recipient phone regression tests.
import { inflateRawSync } from "node:zlib";
import { group, test, api, BASE, ADMIN, rndPhone, rip, assert, M } from "../harness.mjs";

function unzipText(buffer, targetName) {
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString("utf8");
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (name === targetName) {
      const compressed = buffer.subarray(dataStart, dataEnd);
      const data = method === 8 ? inflateRawSync(compressed) : compressed;
      return data.toString("utf8");
    }
    offset = dataEnd;
  }
  return null;
}

export async function register() {
  const { User } = M();
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const email = `xlsx-${token}@test.local`;
  const phone = rndPhone();
  const customer = await User.create({
    name: `مشتری اکسل ${token}`,
    email,
    emailVerified: true,
    phone,
    phoneVerified: true,
    province: "تهران",
    city: "تهران",
    postalCode: "1234567890",
    address: "نشانی آزمایشی",
    favorites: [12345, 67890],
    points: 5,
    vip: true,
    createdAt: new Date("2025-04-03T12:30:00.000Z"),
  });

  group("customer export");
  test("XLSX export is protected by admin authentication", async () => {
    const response = await fetch(`${BASE}/admin/users/export.xlsx`, {
      headers: { "X-Forwarded-For": rip() },
    });
    assert.eq(response.status, 401, "unauthenticated export must be denied");
  });

  test("XLSX export returns a valid OOXML workbook with customer details and no auth secrets", async () => {
    const response = await fetch(`${BASE}/admin/users/export.xlsx?search=${encodeURIComponent(email)}`, {
      headers: { Cookie: ADMIN, "X-Forwarded-For": rip() },
    });
    assert.eq(response.status, 200, "admin export status");
    assert.includes(response.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx content type");
    assert.includes(response.headers.get("content-disposition"), ".xlsx", "download filename");

    const buffer = Buffer.from(await response.arrayBuffer());
    assert.eq(buffer.readUInt32LE(0), 0x04034b50, "ZIP local file header signature");
    const contentTypes = unzipText(buffer, "[Content_Types].xml");
    const sheet = unzipText(buffer, "xl/worksheets/sheet1.xml");
    assert.ok(contentTypes?.includes("spreadsheetml.sheet.main+xml"), "OOXML spreadsheet content type exists");
    assert.ok(sheet, "worksheet XML exists");
    assert.includes(sheet, email, "filtered customer email included");
    assert.includes(sheet, phone, "customer phone included");
    assert.includes(sheet, "12345, 67890", "favorite product IDs included");
    assert.includes(sheet, "تعداد سفارش", "order count column exists");
    assert.ok(!sheet.includes("passwordHash"), "password hash must not be exported");
    assert.ok(!sheet.includes("tokenVersion"), "token version must not be exported");
    assert.ok(!sheet.includes("جمع خرید"), "customer purchase total stays hidden");
  });

  test("notification recipient API continues to expose customer phone", async () => {
    const response = await api(`/admin/notifications/recipients?search=${encodeURIComponent(email)}`, { cookie: ADMIN });
    assert.status(response, 200, "recipient list");
    const recipient = response.j?.recipients?.find((row) => row.id === String(customer._id));
    assert.ok(recipient, "test customer appears in recipient list");
    assert.eq(recipient.phone, phone, "recipient phone is available for UI rendering");
  });

  test("XLSX exports all matches beyond the 500-row customer UI limit", async () => {
    const prefix = `xlsxcap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const documents = Array.from({ length: 501 }, (_, index) => ({
      name: `${prefix} ${index}`,
      email: `${prefix}-${index}@test.local`,
    }));
    await User.insertMany(documents);
    try {
      const visible = await api(`/admin/users?search=${encodeURIComponent(prefix)}`, { cookie: ADMIN });
      assert.status(visible, 200, "regular customer list");
      assert.eq(visible.j?.users?.length, 500, "UI list remains capped at 500 rows");

      const response = await fetch(`${BASE}/admin/users/export.xlsx?search=${encodeURIComponent(prefix)}`, {
        headers: { Cookie: ADMIN, "X-Forwarded-For": rip() },
      });
      assert.eq(response.status, 200, "full export status");
      const buffer = Buffer.from(await response.arrayBuffer());
      const sheet = unzipText(buffer, "xl/worksheets/sheet1.xml");
      const rowCount = [...(sheet ?? "").matchAll(/<row r="\d+"/g)].length;
      assert.eq(rowCount, 502, "one header + 501 matching customers");
      assert.includes(sheet, `${prefix}-500@test.local`, "last customer beyond the UI cap is present");
    } finally {
      await User.deleteMany({ email: { $regex: `^${prefix}-` } });
    }
  });
}
