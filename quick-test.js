// Any quick tests that we want to run `yarn try`

function test() {
  let t;
  switch (1) {
    case 1: {
      [t] = [1];
      break;
    }
    default: {
      break;
    }
  }
  console.log(t);
}

test();
