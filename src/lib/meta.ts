const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v21.0";

export function getMetaConfig() {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!appId || !appSecret || !verifyToken || !appUrl) {
    throw new Error("Missing Meta env vars (META_APP_ID/SECRET, VERIFY_TOKEN, APP_URL)");
  }

  return { appId, appSecret, verifyToken, appUrl, graphVersion: GRAPH_VERSION };
}

export function getOAuthRedirectUri() {
  return `${getMetaConfig().appUrl.replace(/\/$/, "")}/api/auth/facebook/callback`;
}

/** Scopes needed for Page messaging + webhook subscription */
export const META_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_messaging",
  "pages_manage_metadata",
].join(",");
export function buildFacebookOAuthUrl(state: string) {
  const { appId, graphVersion } = getMetaConfig();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: getOAuthRedirectUri(),
    state,
    scope: META_OAUTH_SCOPES,
    response_type: "code",
  });
  return `https://www.facebook.com/${graphVersion}/dialog/oauth?${params}`;
}

export async function exchangeCodeForUserToken(code: string) {
  const { appId, appSecret, graphVersion } = getMetaConfig();
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: getOAuthRedirectUri(),
    code,
  });
  const res = await fetch(
    `https://graph.facebook.com/${graphVersion}/oauth/access_token?${params}`,
  );
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error?.message ?? "Failed to exchange OAuth code");
  }
  return data.access_token as string;
}

export async function exchangeForLongLivedUserToken(shortLivedToken: string) {
  const { appId, appSecret, graphVersion } = getMetaConfig();
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });
  const res = await fetch(
    `https://graph.facebook.com/${graphVersion}/oauth/access_token?${params}`,
  );
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error?.message ?? "Failed to get long-lived token");
  }
  return data.access_token as string;
}

export async function getFacebookUserId(userToken: string) {
  const { graphVersion } = getMetaConfig();
  const res = await fetch(
    `https://graph.facebook.com/${graphVersion}/me?fields=id&access_token=${userToken}`,
  );
  const data = await res.json();
  if (!res.ok || !data.id) {
    throw new Error(data.error?.message ?? "Failed to fetch Facebook user");
  }
  return data.id as string;
}

export type FacebookPageAccount = {
  id: string;
  name: string;
  access_token: string;
};

export async function getUserPages(userToken: string): Promise<FacebookPageAccount[]> {
  const { graphVersion } = getMetaConfig();
  const res = await fetch(
    `https://graph.facebook.com/${graphVersion}/me/accounts?fields=id,name,access_token&access_token=${userToken}`,
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message ?? "Failed to list Pages");
  }
  return (data.data ?? []) as FacebookPageAccount[];
}

/** Subscribe the Page to this app's webhook for messaging fields */
export async function subscribePageToApp(pageId: string, pageAccessToken: string) {
  const { graphVersion } = getMetaConfig();
  const params = new URLSearchParams({
    subscribed_fields: "messages,messaging_postbacks,message_echoes,message_deliveries,message_reads,message_reactions",
    access_token: pageAccessToken,
  });
  const res = await fetch(
    `https://graph.facebook.com/${graphVersion}/${pageId}/subscribed_apps?${params}`,
    { method: "POST" },
  );
  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.error?.message ?? "Failed to subscribe Page to webhook");
  }
  return data;
}

export async function unsubscribePageFromApp(pageId: string, pageAccessToken: string) {
  const { graphVersion } = getMetaConfig();
  const res = await fetch(
    `https://graph.facebook.com/${graphVersion}/${pageId}/subscribed_apps?access_token=${pageAccessToken}`,
    { method: "DELETE" },
  );
  const data = await res.json();
  // Ignore failures on disconnect — token may already be invalid
  return data;
}

export async function sendPageTextMessage(
  pageAccessToken: string,
  recipientPsid: string,
  text: string,
  options?: { replyToMid?: string },
) {
  const { graphVersion } = getMetaConfig();
  const payload: Record<string, unknown> = {
    recipient: { id: recipientPsid },
    messaging_type: "RESPONSE",
    message: { text },
  };
  if (options?.replyToMid) {
    payload.reply_to = { mid: options.replyToMid };
  }

  const res = await fetch(
    `https://graph.facebook.com/${graphVersion}/me/messages?access_token=${pageAccessToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message ?? "Failed to send message");
  }
  return data as { recipient_id?: string; message_id?: string };
}

/** Send an image attachment (public HTTPS URL) as a native Messenger photo. */
export async function sendPageImageMessage(
  pageAccessToken: string,
  recipientPsid: string,
  imageUrl: string,
  options?: { isReusable?: boolean },
) {
  const { graphVersion } = getMetaConfig();
  const payload = {
    recipient: { id: recipientPsid },
    messaging_type: "RESPONSE",
    message: {
      attachment: {
        type: "image",
        payload: {
          url: imageUrl,
          is_reusable: options?.isReusable !== false,
        },
      },
    },
  };

  const res = await fetch(
    `https://graph.facebook.com/${graphVersion}/me/messages?access_token=${pageAccessToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message ?? "Failed to send photo");
  }
  return data as { recipient_id?: string; message_id?: string };
}

export async function reactToPageMessage(
  pageAccessToken: string,
  recipientPsid: string,
  messageId: string,
  reaction: string | null,
) {
  const { graphVersion } = getMetaConfig();
  const body =
    reaction && reaction.trim()
      ? {
          recipient: { id: recipientPsid },
          sender_action: "react",
          payload: {
            message_id: messageId,
            reaction: reaction.trim(),
          },
        }
      : {
          recipient: { id: recipientPsid },
          sender_action: "unreact",
          payload: {
            message_id: messageId,
          },
        };

  const res = await fetch(
    `https://graph.facebook.com/${graphVersion}/me/messages?access_token=${pageAccessToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message ?? "Failed to update reaction");
  }
  return data;
}

export type MetaUserProfile = {
  id: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  profile_pic?: string;
};

/** Resolve customer name from PSID / IGSID using the Page access token */
export async function fetchMessengerUserProfile(
  peerId: string,
  pageAccessToken: string,
): Promise<MetaUserProfile | null> {
  const { graphVersion } = getMetaConfig();
  // Do not request `username` on Messenger PSIDs — Meta returns (#12) deprecated and fails the whole call
  const fields = "name,first_name,last_name,profile_pic";
  const res = await fetch(
    `https://graph.facebook.com/${graphVersion}/${peerId}?fields=${fields}&access_token=${pageAccessToken}`,
  );
  const data = await res.json();
  if (!res.ok || data.error) {
    console.error("profile fetch failed", data.error?.message ?? res.status);
    return null;
  }
  return data as MetaUserProfile;
}
