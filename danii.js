let board = [];
let width, height;

async function sexSex() {
  await getBoard(); // ??? important
}

function* range(to) {
  for (let index = 0; to > index; index++) yield index;
}

function* range2d(coords) {
  const [x, y] = coords;

  for (let xIndex of range(x))
    for (let yIndex of range(y)) yield [xIndex, yIndex];
}

function checkFourInARow(colors) {
  const [w, h] = [width, height];

  function check(x, y) {
    return colors.includes(board[y][x]);
  }

  // --x-
  // --x-
  // --x-
  // --x-

  // Downwards
  for (let [x, y] of range2d([w, h - 3]))
    if (check(x, y + 3) && check(x, y + 2) && check(x, y + 1) && check(x, y))
      return true;

  // ----
  // ----
  // xxxx
  // ----

  // Rightwards
  for (let [x, y] of range2d([w - 3, h]))
    if (check(x + 3, y) && check(x + 2, y) && check(x + 1, y) && check(x, y))
      return true;

  // Diagnonal
  for (let [x, y] of range2d([w - 3, h - 3])) {
    // ---x
    // --x-
    // -x--
    // x---

    if (
      check(x + 3, y + 3) &&
      check(x + 2, y + 2) &&
      check(x + 1, y + 1) &&
      check(x, y)
    )
      return true;

    // x---
    // -x--
    // --x-
    // $--x

    if (
      check(x + 3, y) &&
      check(x + 2, y + 1) &&
      check(x + 1, y + 2) &&
      check(x, y + 3)
    )
      return true;
  }

  return false;
}

function workQuestionMark() {
  function hecker(thing, a, s) {
    board = thing
      .replace(/ /g, "")
      .split("\n")
      .map((row) => row.split(""))
      .map((row) =>
        row.map((character) => {
          switch (character) {
            case "r":
              return 1;
            case "b":
              return 2;
            default:
              return 0;
          }
        })
      )
      .filter((row) => row.length != 0);

    width = board[0].length;
    height = board.length;
    if (checkFourInARow(a) != s)
      throw new Error("YOURE BADDDDDDDDDDDDDDDDDDDDDDDDDDDD");
  }

  hecker(
    `
  rrbbrrbbrr
  bbrrbbrrbb
  rrbbrrbbrr
  bbrrbbrrbb
  rrbbrrbbrr
  bbrrbbrrbb
  rrbbrrbbrr
  bbrrbbrrbb
  rrbbrrbbrr
  bbrrbbrrbb
  `,
    [1],
    false
  );

  hecker(
    `
  rrrr__
  ______
  ______
  ______
  ______
  ______
  `,
    [1],
    true
  );

  hecker(
    `
  __rrrr
  ______
  ______
  `,
    [1],
    true
  );

  hecker(
    `
    _____
    _____
    _____
    _____
    _____
    _____
    rrrr_
    `,
    [1],
    true
  );

  hecker(
    `
    _____
    _rrrr
    `,
    [1],
    true
  );

  hecker(
    `
    r_
    r_
    r_
    r_
    __
    `,
    [1],
    true
  );

  hecker(
    `
    __
    r_
    r_
    r_
    r_
  `,
    [1],
    true
  );

  hecker(
    `
    _r
    _r
    _r
    _r
    __
    `,
    [1],
    true
  );

  hecker(
    `
    __
    _r
    _r
    _r
    _r
    `,
    [1],
    true
  );

  hecker(
    `
    _bbbb
    _____
    `,
    [2],
    true
  );

  hecker(
    `
    _bbbb
    _____
    `,
    [1],
    false
  );

  hecker(
    `
    r____
    _r___
    __r__
    ___r_
    _____
    `,
    [1],
    true
  );

  hecker(
    `
    ___r_
    __r__
    _r___
    r____
    _____
    `,
    [1],
    true
  );

  hecker(
    `
    _____
    r____
    _r___
    __r__
    ___r_
    `,
    [1],
    true
  );

  hecker(
    `
    _____
    ___r_
    __r__
    _r___
    r____
    `,
    [1],
    true
  );

  hecker(
    `
    _r___
    __r__
    ___r_
    ____r
    _____
    `,
    [1],
    true
  );

  hecker(
    `
    ____r
    ___r_
    __r__
    _r___
    _____
    `,
    [1],
    true
  );

  hecker(
    `
    _____
    _r___
    __r__
    ___r_
    ____r
    `,
    [1],
    true
  );

  hecker(
    `
    ______
    ____r
    ___r_
    __r__
    _r___
    `,
    [1],
    true
  );

  hecker(
    `
  rrbbr_bbrr
  bbrrbbrrbb
  rrbbrrbbrr
  bbrrbbrrbb
  rrbbrrbbrr
  bbrrbbrrbb
  rrbbrrbbrr
  bbrrbbrrbb
  rrbbrrbbrr
  bbrrbbrrbb
  `,
    [0, 1],
    false
  );

  hecker(
    `
  rrbbr_bbrr
  bbrrbbrrbb
  rrbbrrbbrr
  bbrrbbrrbb
  rrbbrrbbrr
  bbrrbbrrbb
  rrbbrrbbrr
  bbrrbbrrbb
  rrbbrrbbrr
  bbrrbbrrbb
  `,
    [0, 2],
    false
  );

  hecker(
    `
  rrb____brr
  bbrrbbrrbb
  rrbbrrbbrr
  bbrrbbrrbb
  rrbbrrbbrr
  bbrrbbrrbb
  rrbbrrbbrr
  bbrrbbrrbb
  rrbbrrbbrr
  bbrrbbrrbb
  `,
    [0, 1],
    true
  );

  hecker(
    `
  rrb____brr
  bbrrbbrrbb
  rrbbrrbbrr
  bbrrbbrrbb
  rrbbrrbbrr
  bbrrbbrrbb
  rrbbrrbbrr
  bbrrbbrrbb
  rrbbrrbbrr
  bbrrbbrrbb
  `,
    [0, 2],
    true
  );

  hecker(
    `
    rbrb___
    rbrbrb_
    rbrbrb_
    brbrbr_
    brbrbr_
    brbrbr_
    `,
    [0, 1],
    true
  );

  hecker(
    `
    rbrb___
    rbrbrb_
    rbrbrb_
    brbrbr_
    brbrbr_
    brbrbr_
    `,
    [0, 2],
    true
  );

  hecker(
    `
    rbrb__
    rbrbrb
    rbrbrb
    brbrbr
    brbrbr
    brbrbr
    `,
    [0, 1],
    false
  );

  hecker(
    `
    rbrb__
    rbrbrb
    rbrbrb
    brbrbr
    brbrbr
    brbrbr
    `,
    [0, 2],
    false
  );

  hecker(
    `
    rbrb__
    rbrb_b
    rbrbrb
    brbrbr
    brbrbr
    brbrbr
    `,
    [0, 1],
    false
  );

  hecker(
    `
    rbrb__
    rbrb_b
    rbrbrb
    brbrbr
    brbrbr
    brbrbr
    `,
    [0, 2],
    true
  );
}

workQuestionMark();
