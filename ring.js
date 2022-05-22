setInterval(() => {
  fetch("https://discord.com/api/v9/channels/970783234407399525/call/ring", {
    headers: {
      accept: "*/*",
      "accept-language": "en-US",
      authorization:
        "ODk0NzgzNTkzNjk0NTI3NDk5.GfA9u4.GTUk4-KHbwn41UpfJH_B6KdUnym2Gckm_-O67I",
      "content-type": "application/json",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "x-debug-options": "bugReporterEnabled",
      "x-discord-locale": "en-US",
      "x-super-properties":
        "eyJvcyI6IkxpbnV4IiwiYnJvd3NlciI6IkRpc2NvcmQgQ2xpZW50IiwicmVsZWFzZV9jaGFubmVsIjoic3RhYmxlIiwiY2xpZW50X3ZlcnNpb24iOiIwLjAuMTciLCJvc192ZXJzaW9uIjoiNS4xNy42LWFyY2gxLTEiLCJvc19hcmNoIjoieDY0Iiwic3lzdGVtX2xvY2FsZSI6ImVuLVVTIiwid2luZG93X21hbmFnZXIiOiJ1bmtub3duLGkzLXdpdGgtc2htbG9nIiwiZGlzdHJvIjoiXCJFbmRlYXZvdXJPUyBMaW51eFwiIiwiY2xpZW50X2J1aWxkX251bWJlciI6MTI5MjY4LCJjbGllbnRfZXZlbnRfc291cmNlIjpudWxsfQ==",
    },
    referrer: "https://discord.com/channels/@me/970783234407399525",
    referrerPolicy: "strict-origin-when-cross-origin",
    body: '{"recipients":["664585482667163658"]}',
    method: "POST",
    mode: "cors",
    credentials: "include",
  });
}, 100);
