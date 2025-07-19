const puppeteer = require("puppeteer");
const nodemailer = require("nodemailer");

// Replace with your details
const POSTCODE = process.env.POSTCODE;
const ADDRESS_TEXT = process.env.ADDRESS_TEXT;
const EMAIL = process.env.EMAIL;
const PASS = process.env.PASS; // Not your usual password (see below)
const TO = process.env.TO_EMAIL;

async function sendEmail(message) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: EMAIL, pass: PASS },
  });

  await transporter.sendMail({
    from: EMAIL,
    to: TO,
    subject: "Bin Reminder",
    text: message,
  });
}

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(
    "https://eastrenfrewshire.gov.uk/article/1145/Bin-collection-days",
    {
      waitUntil: "networkidle0",
    }
  );

  // Type postcode and submit
  await page.type("input[name='BINDAYSV2_PAGE1_POSTCODE']", POSTCODE);
  await page.click("button[name='BINDAYSV2_FORMACTION_NEXT']");
  console.log("Submit clicked");
  await page.waitForSelector("select[name='BINDAYSV2_PAGE2_UPRN']", {
    visible: true,
  });
  console.log("Select found");

  // Select your address by visible text
  const addressValue = await page.evaluate((target) => {
    const options = [
      ...document.querySelectorAll(
        "select[name='BINDAYSV2_PAGE2_UPRN'] option"
      ),
    ];
    const match = options.find((o) => o.textContent.includes(target));
    return match ? match.value : "";
  }, ADDRESS_TEXT);

  await page.select("select[name='BINDAYSV2_PAGE2_UPRN']", addressValue);
  await page.click("button[name='BINDAYSV2_FORMACTION_NEXT']");

  await page.waitForSelector("tbody tr");

  // Get the second row (index 1, since 0 is the header row)
  const rowData = await page.$eval("tbody tr:nth-of-type(2)", (row) => {
    const baseUrl = "https://eastrenfrewshire.gov.uk";
    // Grab the date and day if you want them too
    const date = row.querySelector("td:nth-of-type(1)")?.textContent.trim();
    const day = row.querySelector("td:nth-of-type(2)")?.textContent.trim();

    // Grab all images and text inside the 3rd column (Bin Type)
    const binColumn = row.querySelector("td:nth-of-type(3)");
    const bins = Array.from(binColumn.querySelectorAll("img")).map((img) => ({
      icon: baseUrl + img.getAttribute("src").replace(/^\./, ""), // image path
      alt: img.getAttribute("alt"), // descriptive text (like "Brown bin icon")
      label: img.nextSibling?.textContent.trim() || "", // text after the image
    }));

    return { date, day, bins };
  });

  console.log(rowData);

  await browser.close();

  // Map bin types to simple emojis for clarity
  const binEmoji = {
    Brown: "🟤",
    Grey: "⚫️",
    Green: "🟢",
    Blue: "🔵",
  };

  // Build the bin list with emojis
  const binsToday = rowData.bins.map((bin) => {
    const colorKey =
      Object.keys(binEmoji).find((key) => bin.label.startsWith(key)) || "🗑️";
    return `${binEmoji[colorKey]} ${bin.label}`;
  });

  // Create the message
  const msg = `Tomorrow: (${rowData.date} - ${
    rowData.day
  }) is bin day:\n${binsToday.join("\n")}`;

  await sendEmail(msg);
  console.log("Reminder sent");
})();
