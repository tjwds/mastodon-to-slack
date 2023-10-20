const slackify = require("slackify-html");
require("dotenv").config();

const { MASTODON_ACCESS_TOKEN, MASTODON_API_URL, SLACK_WEBHOOK_URL } =
  process.env;

let lastNotificationId = null;

async function fetchMastodonNotifications() {
  const headers = {
    Authorization: `Bearer ${MASTODON_ACCESS_TOKEN}`,
  };

  const response = await fetch(
    lastNotificationId
      ? `${MASTODON_API_URL}?since_id=${lastNotificationId}`
      : MASTODON_API_URL,
    { headers }
  );
  const notifications = await response.json();

  if (notifications.length > 0) {
    const previousNotificationId = lastNotificationId;
    lastNotificationId = notifications[0].id;

    // XXX we could miss notifications like this, but I'm really just trying to
    //     stand something up as soon as possible.
    if (!previousNotificationId) {
      return [];
    }

    return notifications.filter(
      // only mentions, no DMs
      (notification) =>
        notification.type === "mention" &&
        notification.status.visibility !== "direct"
    );
  }

  return [];
}

async function postToSlack(message, originalUrl) {
  const payload = {
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: slackify(message),
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "View original",
            emoji: true,
          },
          value: "click_me_123",
          url: originalUrl,
          action_id: "button-action",
        },
      },
    ],
  };

  const response = await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
  });

  if (response.status === 200) {
    console.log("Message posted to Slack successfully.");
  } else {
    console.error(
      "Error posting message to Slack:",
      response.status,
      await response.text()
    );
  }
}

async function pollAndPostNotifications() {
  try {
    const notifications = await fetchMastodonNotifications();

    if (notifications.length > 0) {
      for (const notification of notifications) {
        const message = `<a href="${notification.account.url}">${notification.account.display_name}</a>\n\n${notification.status.content}`;
        await postToSlack(message, notification.status.url);
      }
    }
  } catch (error) {
    console.error("Error fetching Mastodon notifications:", error);
  }
}

setInterval(pollAndPostNotifications, 10 * 1000);

pollAndPostNotifications();
console.log("Hi.");
