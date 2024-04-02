import Bluefish from "../bluefish.jsx";
import Circle from "../circle.jsx";
import Distribute from "../distribute.jsx";
import Group from "../group.jsx";
import Rect from "../rect.jsx";
import Ref from "../ref.jsx";
import { StackH } from "../stackh.jsx";
import withBluefish from "../withBluefish.jsx";
import { Line } from "./line.js";
import { Path } from "./path.js";
import Text from "../text.jsx";
import Align from "../align.jsx";

const maybeSub = (a, b) =>
  a !== undefined && b !== undefined ? a - b : undefined;

const Weight = withBluefish((props) => (
  <Align alignment="center" x={props.x} y={props.y}>
    <Path
      d={`M 10,0 l ${props.width - 20},0 l 10,${
        props.height
      } l ${-props.width},0 Z`}
      fill="#545454"
      stroke="#545454"
    />
    <Text font-size={"10"} fill="white">
      {props.children}
    </Text>
  </Align>
));

const PulleyCircle = withBluefish((props) => (
  <Align
    alignment="center"
    x={maybeSub(props.cx, props.r ?? 20)}
    y={maybeSub(props.cy, props.r ?? 20)}
  >
    <Circle
      r={props.r ?? 20}
      stroke="#828282"
      stroke-width={3}
      fill="#C1C1C1"
    ></Circle>
    <Circle r={5} fill="#555555"></Circle>
  </Align>
));

// Parts that could use work:
// - pixel based positioning

const r = 25;

const w2jut = 10;

export const Pulley = () => {
  return (
    <Bluefish>
      <Rect
        name="rect"
        height={20}
        width={9 * r}
        // stroke="black"
        fill="#C9C9C9"
        stroke-width={2}
      ></Rect>

      <PulleyCircle name="A" r={r} />
      <PulleyCircle name="B" r={r} />
      <PulleyCircle name="C" r={r} />

      <Distribute direction="horizontal" spacing={-r}>
        <Ref select="A"></Ref>
        <Ref select="B"></Ref>
      </Distribute>
      <Distribute direction="horizontal" spacing={0}>
        <Ref select="B"></Ref>
        <Ref select="C"></Ref>
      </Distribute>
      <Distribute direction="vertical" spacing={40}>
        <Ref select="rect"></Ref>
        <Ref select="B"></Ref>
      </Distribute>
      <Distribute direction="vertical" spacing={30}>
        <Ref select="B"></Ref>
        <Ref select="A"></Ref>
      </Distribute>
      <Distribute direction="vertical" spacing={50}>
        <Ref select="B"></Ref>
        <Ref select="C"></Ref>
      </Distribute>

      <Align alignment="center">
        <Ref select="B"></Ref>
        <Text x={r} y={-r}>
          B
        </Text>
      </Align>
      <Align alignment="center">
        <Ref select="A"></Ref>
        <Text x={-r} y={-r}>
          A
        </Text>
      </Align>
      <Align alignment="center">
        <Ref select="C"></Ref>
        <Text x={r} y={r}>
          C
        </Text>
      </Align>

      <Line source={[0, 0.5]} target={[0.5, 0.5]} name="l1" stroke="#774e32">
        <Ref select="B"></Ref>
        <Ref select="A"></Ref>
      </Line>
      <Line source={[1, 0.5]} target={[0, 0.5]} name="l2" stroke="#774e32">
        <Ref select="B"></Ref>
        <Ref select="C"></Ref>
      </Line>

      <Line target={[1, 0.5]} name="l3" stroke="#774e32">
        <Ref select="rect"></Ref>
        <Ref select="C"></Ref>
      </Line>

      <StackH spacing={5}>
        <Ref select="l1"></Ref>
        <Text name="t1">x</Text>
      </StackH>
      <Distribute spacing={5} direction="horizontal">
        <Ref select="l2"></Ref>
        <Text name="t2">y</Text>
      </Distribute>
      <Distribute spacing={5} direction="horizontal">
        <Ref select="l3"></Ref>
        <Text name="t3">z</Text>
      </Distribute>
      <Align alignment="centerY">
        <Ref select="t1"></Ref>
        <Ref select="t2"></Ref>
        <Ref select="t3"></Ref>
      </Align>

      <StackH name="w1">
        <Weight width={30} height={30}>
          W1
        </Weight>
        // hack to offset the centerX alignment of A and w1
        <Rect fill="transparent" width={r * 2 - 10} />
      </StackH>
      <StackH name="w2">
        // hack to offset the centerX alignment of A and w2
        <Rect fill="transparent" width={r + (r / 2 - 10) - w2jut / 2} />
        <Weight width={r * 3 + w2jut} height={30}>
          W2
        </Weight>
      </StackH>
      <Distribute spacing={50} direction="vertical">
        <Ref select="C"></Ref>
        <Ref select="w2"></Ref>
      </Distribute>
      <Align alignment="left">
        <Ref select="A"></Ref>
        <Ref select="w2"></Ref>
      </Align>
      <Align alignment="centerX">
        <Ref select="A"></Ref>
        <Ref select="w1"></Ref>
      </Align>
      <Align alignment="centerY">
        <Ref select="w1"></Ref>
        <Ref select="w2"></Ref>
      </Align>

      <Line source={[0, 0.5]} name="l4" stroke="#774e32">
        <Ref select="A"></Ref>
        <Ref select="w1"></Ref>
      </Line>
      <Line source={[1, 0.5]} name="l5" stroke="#774e32">
        <Ref select="A"></Ref>
        <Ref select="w2"></Ref>
      </Line>
      <Line source={[0.5, 0.5]} name="l6" stroke="#774e32">
        <Ref select="C"></Ref>
        <Ref select="w2"></Ref>
      </Line>

      <Distribute spacing={5} direction="horizontal">
        <Ref select="l4"></Ref>
        <Text name="t4">p</Text>
      </Distribute>
      <Distribute spacing={5} direction="horizontal">
        <Ref select="l5"></Ref>
        <Text name="t5">q</Text>
      </Distribute>
      <StackH spacing={5}>
        <Ref select="l6"></Ref>
        <Text name="t6">s</Text>
      </StackH>
      <Align alignment="centerY">
        <Ref select="t6"></Ref>
        <Ref select="t5"></Ref>
        <Ref select="t4"></Ref>
      </Align>

      <Group name="G">
        <Ref select="A"></Ref>
        <Ref select="B"></Ref>
        <Ref select="C"></Ref>
      </Group>
      <Align alignment="centerX">
        <Ref select="rect"></Ref>
        <Ref select="G"></Ref>
      </Align>

      {/* Overdraws to make diagram pretty */}
      <PulleyCircle name="Acopy" r={r} />
      <PulleyCircle name="Ccopy" r={r} />

      <Align alignment="center">
        <Ref select="A"></Ref>
        <Ref select="Acopy"></Ref>
      </Align>

      <Align alignment="center">
        <Ref select="C"></Ref>
        <Ref select="Ccopy"></Ref>
      </Align>

      <Line
        source={[0, 0.5]}
        target={[0.5, 0.5]}
        name="l1copy"
        stroke="#774e32"
      >
        <Ref select="B"></Ref>
        <Ref select="A"></Ref>
      </Line>

      <PulleyCircle name="Bcopy" r={r} />
      <Align alignment="center">
        <Ref select="B"></Ref>
        <Ref select="Bcopy"></Ref>
      </Align>

      <Line target={[0.5, 0.5]} name="l0" stroke="#774e32">
        <Ref select="rect"></Ref>
        <Ref select="B"></Ref>
      </Line>
      <Line source={[0.5, 0.5]} name="l6copy" stroke="#774e32">
        <Ref select="C"></Ref>
        <Ref select="w2"></Ref>
      </Line>
    </Bluefish>
  );
};
