import { For, createUniqueId } from "solid-js";
import { Id } from "../scenegraph";
import Rect from "../rect";
import Group from "../group";
import Align from "../align";
import Ref from "../ref";
import { StackSlot } from "./stack-slot";
import Distribute from "../distribute";
// import Text from "../text";

export type GlobalFrameProps = {
  id?: Id;
  variables: any;
};

export function GlobalFrame(props: GlobalFrameProps) {
  const id = createUniqueId();

  // Font declaration
  const fontFamily = "Andale mono, monospace";

  return (
    <Group x={0} y={0} id={props.id ?? `group${id}`}>
      {/* Global Frame and relevant text */}
      <Rect id={`frame${id}`} height={300} width={200} fill={"#e2ebf6"} />
      <Rect id={`frameBorder${id}`} height={300} width={5} fill={"#a6b3b6"} />
      {/* <Text
        name={opIdLabel}
        contents={"Global Frame"}
        fontSize={"24px"}
        fontFamily={fontFamily}
        fill={"black"}
      /> */}
      <Rect id={`label${id}`} fill="black" width={100} height={20} />
      <Align id={`align1${id}`} alignment="topCenter">
        <Ref id={`ref1${id}`} refId={`label${id}`} />
        <Ref id={`ref2${id}`} refId={`frame${id}`} />
      </Align>
      <Align id={`align3${id}`} alignment="centerLeft">
        <Ref id={`ref6${id}`} refId={`frameBorder${id}`} />
        <Ref id={`ref7${id}`} refId={`frame${id}`} />
      </Align>
      <Distribute id={`distribute${id}`} direction="vertical" spacing={10}>
        <Ref id={`ref3${id}`} refId={`label${id}`} />
        <Group id={`frameVariables${id}`}>
          <For each={props.variables}>
            {(variable: any, i) => <StackSlot id={`stackSlot${id}-${i()}`} />}
          </For>
          <Align id={`alignStackSlot${id}`} alignment="right">
            <For each={props.variables}>
              {(variable: any, i) => (
                <Ref
                  id={`alignRefStackSlot${id}-${i()}`}
                  refId={`stackSlot${id}-${i()}`}
                />
              )}
            </For>
          </Align>
          <Distribute
            id={`distributeStackSlot${id}`}
            direction="vertical"
            spacing={10}
          >
            <For each={props.variables}>
              {(variable: any, i) => (
                <Ref
                  id={`distributeRefStackSlot${id}-${i()}`}
                  refId={`stackSlot${id}-${i()}`}
                />
              )}
            </For>
          </Distribute>
        </Group>
      </Distribute>
      <Align id={`align2${id}`} alignment="right">
        <Ref id={`ref4${id}`} refId={`frameVariables${id}`} />
        <Ref id={`ref5${id}`} refId={`label${id}`} />
      </Align>
    </Group>
  );
}

export default GlobalFrame;