/**
 * Offline checks for the deterministic parts of the reply pipeline.
 * Fixtures are generic businesses on purpose — nothing here may depend on
 * one Page's catalog. Run: npm run test:ai
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { captionWithPhotos, toMessengerText } from "@/ai/format";
import { messageWantsPhoto, turnWantsPhoto } from "@/ai/intents";
import { matchRequestedPhotos } from "@/ai/photo-match";
import { finalizeIntents } from "@/ai/router";

const photo = (name: string) => ({ name, image_url: `https://cdn.test/${encodeURIComponent(name)}.jpg`, active: true });

const CLOTHING = [
  photo("Blue Hoodie"),
  photo("Red Hoodie"),
  photo("Canvas Tote Bag"),
  { name: "Gift Card", image_url: null, active: true },
];
const PIZZERIA = [photo("Margherita Pizza"), photo("Pepperoni Pizza"), photo("Tiramisu"), photo("Caesar Salad")];
const SPANISH_SHOP = [photo("Zapatillas deportivas"), photo("Botas de cuero"), photo("Sandalias")];
const GEORGIAN_SHOP = [photo("წითელი კაბა"), photo("შავი კაბა"), photo("ტყავის ჩანთა")];
const SINGLE = [photo("Phone Repair")];

const names = (items: Array<{ name: string }>) => items.map((i) => i.name).sort();

describe("photo keyword hint", () => {
  it("recognises picture requests in several languages", () => {
    for (const text of [
      "send me a picture of the tote",
      "show me the blue one",
      "what does it look like?",
      "pics please",
      "სურათი გაქვთ?",
      "ფოტო ჩამიგდე",
      "როგორ გამოიყურება?",
      "пришлите фото",
    ]) {
      assert.ok(messageWantsPhoto(text), text);
    }
  });

  it("does not fire on ordinary messages", () => {
    for (const text of [
      "call me tomorrow",
      "ჩამირეკე ხვალ",
      "send me the invoice",
      "move my appointment to Wednesday, same time",
      "how much is delivery?",
      "hello",
      "I'd like to book a table for 4",
    ]) {
      assert.equal(messageWantsPhoto(text), false, text);
    }
  });

  it("a short retry counts only right after a picture request", () => {
    const afterPhoto = [
      { role: "user", content: "can you send a photo of the red hoodie?" },
      { role: "assistant", content: "Sorry, I couldn't find it." },
    ];
    const afterOther = [
      { role: "user", content: "book me for 3pm" },
      { role: "assistant", content: "That slot is taken." },
    ];
    assert.ok(turnWantsPhoto("try again", afterPhoto));
    assert.equal(turnWantsPhoto("try again", afterOther), false);
    assert.equal(
      turnWantsPhoto("again, what are your opening hours on weekends and do you deliver?", afterPhoto),
      false,
    );
  });
});

describe("router intent finalization", () => {
  const photoHistory = [
    { role: "user" as const, content: "send me photos of the blue and red hoodie" },
    { role: "assistant" as const, content: "Here they are." },
  ];

  it("drops a photo intent the router carried over from an earlier turn", () => {
    assert.deepEqual(
      finalizeIntents(["booking_change", "photo"], "move it to Wednesday, same time", photoHistory, false),
      ["booking_change"],
    );
  });

  it("trusts the router's photo flag in languages the keywords don't know", () => {
    assert.deepEqual(finalizeIntents(["photo"], "¿me mandas una imagen de las botas?", [], true), ["photo"]);
    assert.deepEqual(finalizeIntents(["catalog"], "Kannst du mir ein Bild schicken?", [], true), [
      "catalog",
      "photo",
    ]);
  });

  it("adds photo from the keyword hint when the router missed it", () => {
    assert.deepEqual(finalizeIntents(["catalog"], "show me the tote", [], false), ["catalog", "photo"]);
  });

  it("never returns an empty intent list", () => {
    assert.deepEqual(finalizeIntents(["photo"], "ok thanks", photoHistory, false), ["other"]);
  });
});

describe("photo matching (catalog-agnostic)", () => {
  it("sends every item the customer named", () => {
    assert.deepEqual(names(matchRequestedPhotos(CLOTHING, "photos of the blue hoodie and the tote bag")), [
      "Blue Hoodie",
      "Canvas Tote Bag",
    ]);
    assert.deepEqual(names(matchRequestedPhotos(PIZZERIA, "can I see the tiramisu and the caesar salad")), [
      "Caesar Salad",
      "Tiramisu",
    ]);
  });

  it("a shared word does not pull in siblings of a specifically named item", () => {
    assert.deepEqual(names(matchRequestedPhotos(CLOTHING, "picture of the red hoodie")), ["Red Hoodie"]);
    assert.deepEqual(names(matchRequestedPhotos(PIZZERIA, "pepperoni pizza photo")), ["Pepperoni Pizza"]);
    assert.deepEqual(names(matchRequestedPhotos(GEORGIAN_SHOP, "შავი კაბის ფოტო")), ["შავი კაბა"]);
    assert.deepEqual(names(matchRequestedPhotos(CLOTHING, "red and blue hoodie pics")), [
      "Blue Hoodie",
      "Red Hoodie",
    ]);
  });

  it("a category word alone means every item in that category", () => {
    assert.deepEqual(names(matchRequestedPhotos(CLOTHING, "hoodie photos")), ["Blue Hoodie", "Red Hoodie"]);
    assert.deepEqual(names(matchRequestedPhotos(CLOTHING, "the hoodies and the tote")), [
      "Blue Hoodie",
      "Canvas Tote Bag",
      "Red Hoodie",
    ]);
  });

  it("handles inflected and non-English names", () => {
    assert.deepEqual(names(matchRequestedPhotos(SPANISH_SHOP, "fotos de las botas")), ["Botas de cuero"]);
    assert.deepEqual(names(matchRequestedPhotos(GEORGIAN_SHOP, "ჩანთის სურათი მაჩვენე")), ["ტყავის ჩანთა"]);
  });

  it("works with a single-item catalog", () => {
    assert.deepEqual(names(matchRequestedPhotos(SINGLE, "photo of the repair")), ["Phone Repair"]);
  });

  it("does not match unrelated or very short words", () => {
    assert.deepEqual(names(matchRequestedPhotos(CLOTHING, "move my booking to wednesday")), []);
    assert.deepEqual(names(matchRequestedPhotos(PIZZERIA, "a an of to")), []);
  });

  it("skips items without a photo", () => {
    assert.deepEqual(names(matchRequestedPhotos(CLOTHING, "gift card photo")), []);
  });
});

describe("reply formatting", () => {
  it("removes markdown, fake tool calls and photo markers", () => {
    const out = toMessengerText("**Blue Hoodie**\n\n📷\n\n[send_photo]\nRed Hoodie 📷\n# Price\n[site](https://x.test)");
    assert.equal(out.includes("**"), false);
    assert.equal(out.includes("📷"), false);
    assert.equal(out.includes("send_photo"), false);
    assert.equal(out.includes("#"), false);
    assert.ok(out.includes("Blue Hoodie"));
  });

  it("drops 'already sent' / 'no photo' claims when a photo is going out, keeps the rest", () => {
    const photos = [{ itemName: "Blue Hoodie" }];
    assert.equal(captionWithPhotos("Here it is. The photo was already sent.", photos).includes("already"), false);
    const mixed = captionWithPhotos("Sorry, we don't have a photo of that. Delivery is $5.", photos);
    assert.equal(/don't have/.test(mixed), false);
    assert.ok(mixed.includes("$5"));
    assert.equal(captionWithPhotos("Sorry, we don't have a photo of that.", photos), "📷 Blue Hoodie");
    assert.equal(captionWithPhotos("ფოტო უკვე გაგზავნილია.", photos).includes("უკვე"), false);
  });

  it("leaves text alone when no photo is sent", () => {
    assert.equal(captionWithPhotos("We don't have a photo of that.", []), "We don't have a photo of that.");
  });
});
