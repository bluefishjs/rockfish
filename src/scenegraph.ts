import { SetStoreFunction, createStore, produce } from "solid-js/store";
import { getLCAChainSuffixes } from "./util/lca";
import _ from "lodash";
import { maybe, maybeAdd, maybeAddAll } from "./util/maybe";
import { createContext, createMemo, useContext } from "solid-js";
import {
  BBox,
  Dim,
  Axis,
  axisMap,
  inferenceRules,
  createLinSysBBox,
} from "./util/bbox";
import { Scope, resolveName } from "./createName";
import { useError } from "./errorContext";
import {
  BluefishError,
  accumulatedTransformUndefinedError,
  deleteNodeRefError,
  deleteRefNodeError,
  dimAlreadyOwnedError,
  dimNaNError,
  dimSetUndefinedError,
  idNotFoundError,
  parentRefError,
  translateAlreadyOwnedError,
} from "./errors";

export type Id = string;
export type Inferred = { inferred: true };
export const inferred: Inferred = { inferred: true };

export type { BBox, Dim, Axis };
export { axisMap };

export type BBoxOwners = { [key in Dim]?: Id | Inferred };

export type Transform = {
  translate: {
    x?: number;
    y?: number;
  };
};

export type RequiredTransform = {
  translate: {
    x: number;
    y: number;
  };
};

export type TransformOwners = {
  translate: {
    x?: Id;
    y?: Id;
  };
};

export type ChildNode = {
  name: Id;
  bbox: BBox;
  owned: { [key in Dim]: boolean };
};

export type ScenegraphNode =
  | {
      type: "node";
      bbox: BBox;
      bboxOwners: BBoxOwners;
      transform: Transform;
      transformOwners: TransformOwners;
      children: Id[];
      parent: Id | null;
      customData?: any;
      layout: () => void;
    }
  | {
      type: "ref";
      refId: Id;
      parent: Id | null;
    };

export type Scenegraph = {
  [key: Id]: ScenegraphNode;
};

export const createScenegraph = (): ScenegraphContextType => {
  const [scenegraph, setScenegraph] = createStore<Scenegraph>({});

  // constructors //
  const createNode = (id: Id, parentId: Id | null) => {
    const error = useError();

    const { bbox, owners: bboxOwners } = createLinSysBBox();

    setScenegraph(id, {
      type: "node",
      bbox,
      bboxOwners,
      transform: { translate: {} },
      transformOwners: { translate: {} },
      children: [],
      parent: parentId,
      customData: { customData: {} },
      layout: () => {},
    });

    if (parentId !== null) {
      setScenegraph(parentId, (node: ScenegraphNode) => {
        if (node.type === "ref") {
          error(
            parentRefError({
              source: parentId,
              caller: "createNode",
              child: id,
            })
          );
          return node;
        }

        return {
          ...node,
          children: [...node.children, id],
        };
      });
    }
  };

  const deleteNode = (
    error: (error: BluefishError) => void,
    id: Id,
    setScope: SetStoreFunction<Scope>
  ) => {
    const node = scenegraph[id];

    if (node === undefined) {
      error(idNotFoundError({ source: id, caller: "deleteNode" }));
      return;
    }

    if (node.type === "ref") {
      error(deleteNodeRefError(id));
      return;
    }

    if (node.parent !== null) {
      const nodeParent = node.parent;
      setScenegraph(node.parent, (node: ScenegraphNode) => {
        if (node.type === "ref") {
          error(
            parentRefError({
              source: nodeParent,
              caller: "deleteNode",
              child: id,
            })
          );
          return node;
        }

        return {
          ...node,
          children: node.children.filter((c) => c !== id),
        };
      });
    }

    // COMBAK: it's not yet clear whether nodes should be recursively deleted
    // for (const childId of node.children) {
    //   deleteNode(childId);
    // }

    // filter out scopes that have this id as their layoutNode
    setScope(
      produce((scope) => {
        for (const key of Object.keys(scope) as Array<Id>) {
          if (scope[key].layoutNode === id) {
            delete scope[key];
          }
        }
      })
    );

    setScenegraph({ ...scenegraph, [id]: undefined });
  };

  // unlike the other functions, we have to pass `error` explicitly, because the error context is
  // not accessible from `onCleanup`.
  const deleteRef = (error: (error: BluefishError) => void, id: Id) => {
    const node = scenegraph[id];

    if (node === undefined) {
      error(idNotFoundError({ source: id, caller: "deleteRef" }));
      return;
    }

    if (node.type === "node") {
      error(deleteRefNodeError(id));
      return;
    }

    if (node.parent !== null) {
      const nodeParent = node.parent;
      setScenegraph(node.parent, (node: ScenegraphNode) => {
        if (node.type === "ref") {
          error(
            parentRefError({
              source: nodeParent,
              caller: "deleteRef",
              child: id,
            })
          );
          return node;
        }

        return {
          ...node,
          children: node.children.filter((c) => c !== id),
        };
      });
    }

    setScenegraph({ ...scenegraph, [id]: undefined });
  };

  const createRef = (id: Id, refId: Id, parentId: Id) => {
    const error = useError();

    setScenegraph(id, {
      type: "ref",
      refId,
      parent: parentId,
    });

    if (parentId !== null) {
      setScenegraph(parentId, (node: ScenegraphNode) => {
        if (node.type === "ref") {
          error(
            parentRefError({
              source: parentId,
              caller: "createRef",
              child: id,
            })
          );
          return node;
        }

        return {
          ...node,
          children: [...node.children, id],
        };
      });
    }
  };

  // returns resolved node (either the input node or the node it references)
  // if the input node is a ref, then it returns the accumulated transform from the node to the ref
  // TODO: doesn't support ref of ref
  const resolveRef = (
    id: Id,
    mode: "read" | "write" | "check",
    accumulatedTransform: RequiredTransform = {
      translate: { x: 0, y: 0 },
    }
  ): {
    id: Id;
    transform: RequiredTransform;
  } => {
    const node = scenegraph[id];

    // base case
    if (node.type === "node") {
      return {
        id,
        transform: accumulatedTransform,
      };
    }

    const refNode = scenegraph[node.refId];

    if (refNode === undefined) {
      throw new Error(`Ref node ${node.refId} not found`);
    }

    if (refNode.type === "ref") {
      throw new Error("Ref of ref not supported");
    }

    if (mode === "check") {
      // skip materialization
      return {
        id: node.refId,
        transform: accumulatedTransform,
      };
    }

    // To resolve a reference we have to do two things:
    // 1. If the node side's transform is fully resolved, we default transforms on the ref side to 0
    // 2. Accumulate the transform from the node to the ref
    /* 
Suppose we have the following graph:
Example {x: ...}
  Circle {x: 50} #circle
  Align {x: ?}
    Ref #circle

Then we will fill in Align's x transform.
Example {x: ...}
  Circle {x: 50} # circle
  Align {x: 0}
    Ref circle

The accumulated transform will be {x: 50}, which is the transform of the circle as it appears to
the align node.
*/
    const [idSuffix, refIdSuffix] = getLCAChainSuffixes(
      scenegraph,
      id,
      node.refId
    );

    if (
      // if mode is read and the ref node's left is undefined, then we don't want to materialize
      // transforms b/c we can't resolve the ref node's left anyway
      !(
        mode === "read" &&
        (refNode as ScenegraphNode & { type: "node" }).bbox.left === undefined
      )
    ) {
      // default all undefined transforms to 0 on the id side
      for (const idSf of idSuffix) {
        setScenegraph(
          idSf,
          produce((n: ScenegraphNode) => {
            const node = n as ScenegraphNode & { type: "node" };
            if (node.transform.translate.x === undefined) {
              node.transform.translate.x = 0;
              node.transformOwners.translate.x = id;
            }
          })
        );

        accumulatedTransform.translate.x -= (
          scenegraph[idSf] as ScenegraphNode & { type: "node" }
        ).transform.translate.x!;
      }

      for (const refIdSf of refIdSuffix) {
        setScenegraph(
          refIdSf,
          produce((n: ScenegraphNode) => {
            const node = n as ScenegraphNode & { type: "node" };
            if (node.transform.translate.x === undefined) {
              node.transform.translate.x = 0;
              node.transformOwners.translate.x = id;
            }
          })
        );

        accumulatedTransform.translate.x += (
          scenegraph[refIdSf] as ScenegraphNode & { type: "node" }
        ).transform.translate.x!;
      }
    }

    if (
      // if mode is read and the ref node's top is undefined, then we don't want to materialize
      // transforms b/c we can't resolve the ref node's top anyway
      !(
        mode === "read" &&
        (refNode as ScenegraphNode & { type: "node" }).bbox.top === undefined
      )
    ) {
      // default all undefined transforms to 0 on the id side
      for (const idSf of idSuffix) {
        setScenegraph(
          idSf,
          produce((n: ScenegraphNode) => {
            const node = n as ScenegraphNode & { type: "node" };
            if (node.transform.translate.y === undefined) {
              node.transform.translate.y = 0;
              node.transformOwners.translate.y = id;
            }
          })
        );

        accumulatedTransform.translate.y -= (
          scenegraph[idSf] as ScenegraphNode & { type: "node" }
        ).transform.translate.y!;
      }

      for (const refIdSf of refIdSuffix) {
        setScenegraph(
          refIdSf,
          produce((n: ScenegraphNode) => {
            const node = n as ScenegraphNode & { type: "node" };
            if (node.transform.translate.y === undefined) {
              node.transform.translate.y = 0;
              node.transformOwners.translate.y = id;
            }
          })
        );

        accumulatedTransform.translate.y += (
          scenegraph[refIdSf] as ScenegraphNode & { type: "node" }
        ).transform.translate.y!;
      }
    }
    return resolveRef(node.refId, mode, accumulatedTransform);
  };

  const getBBox = (id: string): BBox => {
    const { id: resolvedId, transform } = resolveRef(id, "read");
    const node = scenegraph[resolvedId] as ScenegraphNode & { type: "node" }; // guaranteed by resolveRef

    return {
      get left() {
        return maybeAddAll(
          node.bbox.left,
          node.transform.translate.x,
          transform.translate.x
        );
      },
      get centerX() {
        return maybeAddAll(
          node.bbox.centerX,
          node.transform.translate.x,
          transform.translate.x
        );
      },
      get right() {
        return maybeAddAll(
          node.bbox.right,
          node.transform.translate.x,
          transform.translate.x
        );
      },
      get top() {
        return maybeAddAll(
          node.bbox.top,
          node.transform.translate.y,
          transform.translate.y
        );
      },
      get centerY() {
        return maybeAddAll(
          node.bbox.centerY,
          node.transform.translate.y,
          transform.translate.y
        );
      },
      get bottom() {
        return maybeAddAll(
          node.bbox.bottom,
          node.transform.translate.y,
          transform.translate.y
        );
      },
      get width() {
        return node.bbox.width;
      },
      get height() {
        return node.bbox.height;
      },
    };
  };

  // merge bbox and transform into the id node. these properties are owned by the owner node
  const mergeBBoxAndTransform = (
    owner: Id,
    id: Id,
    bbox: BBox,
    transform: Transform
  ) => {
    const error = useError();
    // TODO: should I untrack this?
    // const { id: resolvedId, transform: accumulatedTransform } = resolveRef(id);

    // if any of the bbox values are NaN (undefined is ok), error and skip
    for (const key of Object.keys(bbox) as Array<Dim>) {
      if (bbox[key] !== undefined && isNaN(bbox[key]!)) {
        error(dimNaNError({ source: owner, name: id, dim: key }));
        return;
      }
    }

    setScenegraph(
      id,
      produce((n: ScenegraphNode) => {
        const node = n as ScenegraphNode & { type: "node" }; // guaranteed by resolveRef

        // check bbox ownership
        for (const key of Object.keys(bbox) as Array<Dim>) {
          if (
            bbox[key] !== undefined &&
            node.bboxOwners[key] !== undefined &&
            node.bboxOwners[key] !== owner
          ) {
            error(
              dimAlreadyOwnedError({
                source: owner,
                name: id,
                owner: node.bboxOwners[key]!,
                dim: key,
                value: bbox[key]!,
              })
            );
            return node;
          }
        }

        // check transform ownership
        for (const key of Object.keys(transform?.translate ?? {}) as Array<
          keyof Transform["translate"]
        >) {
          if (
            transform?.translate[key] !== undefined &&
            node.transformOwners.translate[key] !== undefined &&
            node.transformOwners.translate[key] !== owner
          ) {
            error(
              translateAlreadyOwnedError({
                source: owner,
                name: id,
                owner: node.transformOwners.translate[key]!,
                axis: key,
                value: transform.translate[key]!,
              })
            );
            return node;
          }
        }

        const newBBoxOwners: BBoxOwners = {
          ...(bbox.left !== undefined ? { left: owner } : {}),
          ...(bbox.centerX !== undefined ? { centerX: owner } : {}),
          ...(bbox.right !== undefined ? { right: owner } : {}),
          ...(bbox.top !== undefined ? { top: owner } : {}),
          ...(bbox.centerY !== undefined ? { centerY: owner } : {}),
          ...(bbox.bottom !== undefined ? { bottom: owner } : {}),
          ...(bbox.width !== undefined ? { width: owner } : {}),
          ...(bbox.height !== undefined ? { height: owner } : {}),
        };

        const newTransformOwners: TransformOwners = {
          translate: {
            x: transform?.translate.x !== undefined ? owner : undefined,
            y: transform?.translate.y !== undefined ? owner : undefined,
          },
        };

        const newTransform = {
          translate: transform?.translate ?? {},
        };

        for (const key of Object.keys(bbox) as Array<Dim>) {
          if (bbox[key] !== undefined) {
            node.bbox[key] = bbox[key];
          }
        }

        for (const key of Object.keys(newBBoxOwners) as Array<Dim>) {
          if (newBBoxOwners[key] !== undefined) {
            node.bboxOwners[key] = newBBoxOwners[key];
          }
        }

        if (newTransform.translate.x !== undefined) {
          node.transform.translate.x = newTransform.translate.x;
        }

        if (newTransform.translate.y !== undefined) {
          node.transform.translate.y = newTransform.translate.y;
        }

        if (newTransformOwners.translate.x !== undefined) {
          node.transformOwners.translate.x = newTransformOwners.translate.x;
        }

        if (newTransformOwners.translate.y !== undefined) {
          node.transformOwners.translate.y = newTransformOwners.translate.y;
        }
      })
    );
  };

  const setCustomData = (id: Id, customData: any) => {
    setScenegraph(
      id,
      produce((n: ScenegraphNode) => {
        const node = n as ScenegraphNode & { type: "node" }; // guaranteed by resolveRef

        if (customData !== undefined) {
          node.customData = customData;
        }
      })
    );
  };

  const setLayout = (id: Id, layout: LayoutFn) => {
    const layoutMemo = createMemo(() => {
      for (const childId of scenegraph[id]?.children ?? []) {
        if ("layout" in scenegraph[childId]) {
          scenegraph[childId].layout();
        }
      }

      // scan children of layout and clear all of id's ownership
      // TODO: this does not support lazy materialization...
      // for (const childId of scenegraph[id]?.children ?? []) {
      //   // inspect ownership bbox
      //   const childNode = scenegraph[childId];
      //   if (childNode.type === "node") {
      //     for (const dim of Object.keys(childNode.bboxOwners) as Array<Dim>) {
      //       if (childNode.bboxOwners[dim] === id) {
      //         childNode.bboxOwners[dim] = undefined;
      //       }
      //     }
      //   }
      // }

      // // scan our own ownership and clear anything that's owned by our parent
      // // let clearId = id;
      // let node = scenegraph[id];
      // // while (node.parent !== null) {
      // setScenegraph(
      //   clearId,
      //   "bboxOwners",
      //   produce((bboxOwners: BBoxOwners) => {
      //     for (const dim of Object.keys(bboxOwners) as Array<Dim>) {
      //       console.log(bboxOwners[dim], node.parent);
      //       if (bboxOwners[dim] === node.parent) {
      //         console.log("clearing", clearId, dim);
      //         bboxOwners[dim] = undefined;
      //       }
      //     }
      //   })
      // );

      const { bbox, transform, customData } = layout(
        (scenegraph[id]?.children ?? []).map((childId: Id) =>
          createChildRepr(id, childId)
        )
      );

      // setBBox(props.id, bbox, props.id, transform);
      mergeBBoxAndTransform(id, id, bbox, transform);
      setCustomData(id, customData);
    });

    setScenegraph(
      id,
      produce((n: ScenegraphNode) => {
        const node = n as ScenegraphNode & { type: "node" }; // guaranteed by resolveRef
        node.layout = layoutMemo;
      })
    );
  };

  const setBBox = (owner: Id, id: Id, bbox: BBox) => {
    const error = useError();

    const { id: resolvedId, transform: accumulatedTransform } = resolveRef(
      id,
      "write"
    );

    // if any of the bbox values are NaN (undefined is ok), error and skip
    for (const key of Object.keys(bbox) as Array<Dim>) {
      if (bbox[key] !== undefined && isNaN(bbox[key]!)) {
        error(dimNaNError({ source: owner, name: id, dim: key }));
        return;
      }
    }

    const node = scenegraph[resolvedId] as ScenegraphNode & { type: "node" }; // guaranteed by resolveRef

    const proposedBBox: BBox = {};
    const proposedTransform: Transform = {
      translate: {},
    };

    for (const dim of [
      "left",
      "centerX",
      "right",
      "top",
      "centerY",
      "bottom",
    ] as const) {
      if (bbox[dim] === undefined) continue;

      const axis = axisMap[dim];
      if (accumulatedTransform.translate[axis] === undefined) {
        error(
          accumulatedTransformUndefinedError({
            source: owner,
            name: resolvedId,
            dim,
            axis,
            value: bbox[dim]!,
          })
        );
        continue;
      }

      if (
        node.bboxOwners[dim] === owner ||
        node.bboxOwners[dim] === undefined
      ) {
        if (node.transformOwners.translate[axis] === undefined) {
          // need to set the translate[axis] so that the dim doesn't move
          // NOTE: this case doesn't always happen. e.g. `right` could be set before `left` in which
          // case `right` has already set the translate.x
          proposedTransform.translate[axis] = 0;
          proposedBBox[dim] = bbox[dim]!;
        } else {
          proposedBBox[dim] = bbox[dim]! - node.transform.translate[axis]!;
        }
      } else if (
        node.transformOwners.translate[axis] === owner ||
        node.transformOwners.translate[axis] === undefined
      ) {
        proposedTransform.translate[axis] = bbox[dim]! - node.bbox[dim]!;
      } else {
        error(
          dimAlreadyOwnedError({
            source: owner,
            name: resolvedId,
            owner: node.bboxOwners[dim]!,
            dim,
            value: bbox[dim]!,
          })
        );
        return;
      }
    }

    for (const dim of ["width", "height"] as const) {
      if (bbox[dim] === undefined) continue;

      if (
        node.bboxOwners[dim] === owner ||
        node.bboxOwners[dim] === undefined
      ) {
        proposedBBox[dim] = bbox[dim]!;
      } else {
        error(
          dimAlreadyOwnedError({
            source: owner,
            name: resolvedId,
            owner: node.bboxOwners[dim]!,
            dim,
            value: bbox[dim]!,
          })
        );
        return;
      }
    }

    proposedTransform.translate.x = maybeAdd(
      proposedTransform.translate.x,
      accumulatedTransform.translate.x
    );

    proposedTransform.translate.y = maybeAdd(
      proposedTransform.translate.y,
      accumulatedTransform.translate.y
    );

    mergeBBoxAndTransform(owner, resolvedId, proposedBBox, proposedTransform);
  };

  const ownedByOther = (
    id: Id, // with respect to `id`
    check: Id, // is `check` already owned
    dim: Dim // on this `dim`?
  ): boolean => {
    const { id: resolvedId } = resolveRef(check, "check");
    const node = scenegraph[resolvedId] as ScenegraphNode & { type: "node" }; // guaranteed by resolveRef

    if (dim === "left" || dim === "centerX" || dim === "right") {
      return !(
        node.bboxOwners[dim] === undefined ||
        node.bboxOwners[dim] === id ||
        node.transformOwners.translate.x === undefined ||
        node.transformOwners.translate.x === id
      );
    } else if (dim === "top" || dim === "centerY" || dim === "bottom") {
      return !(
        node.bboxOwners[dim] === undefined ||
        node.bboxOwners[dim] === id ||
        node.transformOwners.translate.y === undefined ||
        node.transformOwners.translate.y === id
      );
    } else if (dim === "width" || dim === "height") {
      return !(
        node.bboxOwners[dim] === undefined || node.bboxOwners[dim] === id
      );
    } else {
      throw new Error(`Invalid dim: ${dim}`);
    }
  };

  const createChildRepr = (owner: Id, childId: Id): ChildNode => {
    const error = useError();

    return {
      name: childId,
      bbox: {
        get left() {
          return getBBox(childId).left;
        },
        set left(left: number | undefined) {
          if (left === undefined) {
            error(
              dimSetUndefinedError({
                source: owner,
                name: childId,
                dim: "left",
              })
            );
            return;
          }

          setBBox(owner, childId, { left });
        },
        get centerX() {
          return getBBox(childId).centerX;
        },
        set centerX(centerX: number | undefined) {
          if (centerX === undefined) {
            error(
              dimSetUndefinedError({
                source: owner,
                name: childId,
                dim: "centerX",
              })
            );
            return;
          }

          setBBox(owner, childId, { centerX });
        },
        get right() {
          return getBBox(childId).right;
        },
        set right(right: number | undefined) {
          if (right === undefined) {
            error(
              dimSetUndefinedError({
                source: owner,
                name: childId,
                dim: "right",
              })
            );
            return;
          }
          setBBox(owner, childId, { right });
        },
        get top() {
          return getBBox(childId).top;
        },
        set top(top: number | undefined) {
          if (top === undefined) {
            error(
              dimSetUndefinedError({
                source: owner,
                name: childId,
                dim: "top",
              })
            );
            return;
          }

          setBBox(owner, childId, { top });
        },
        get centerY() {
          return getBBox(childId).centerY;
        },
        set centerY(centerY: number | undefined) {
          if (centerY === undefined) {
            error(
              dimSetUndefinedError({
                source: owner,
                name: childId,
                dim: "centerY",
              })
            );
            return;
          }

          setBBox(owner, childId, { centerY });
        },
        get bottom() {
          return getBBox(childId).bottom;
        },
        set bottom(bottom: number | undefined) {
          if (bottom === undefined) {
            error(
              dimSetUndefinedError({
                source: owner,
                name: childId,
                dim: "bottom",
              })
            );
            return;
          }

          setBBox(owner, childId, { bottom });
        },
        get width() {
          return getBBox(childId).width;
        },
        set width(width: number | undefined) {
          if (width === undefined) {
            error(
              dimSetUndefinedError({
                source: owner,
                name: childId,
                dim: "width",
              })
            );
            return;
          }

          setBBox(owner, childId, { width });
        },
        get height() {
          return getBBox(childId).height;
        },
        set height(height: number | undefined) {
          if (height === undefined) {
            error(
              dimSetUndefinedError({
                source: owner,
                name: childId,
                dim: "height",
              })
            );
            return;
          }

          setBBox(owner, childId, { height });
        },
      },
      owned: {
        get left() {
          return ownedByOther(owner, childId, "left");
        },
        get centerX() {
          return ownedByOther(owner, childId, "centerX");
        },
        get right() {
          return ownedByOther(owner, childId, "right");
        },
        get top() {
          return ownedByOther(owner, childId, "top");
        },
        get centerY() {
          return ownedByOther(owner, childId, "centerY");
        },
        get bottom() {
          return ownedByOther(owner, childId, "bottom");
        },
        get width() {
          return ownedByOther(owner, childId, "width");
        },
        get height() {
          return ownedByOther(owner, childId, "height");
        },
      },
    };
  };

  return {
    scenegraph,
    // constructors
    createNode,
    deleteNode,
    createRef,
    deleteRef,
    // mid-level API
    resolveRef,
    mergeBBoxAndTransform,
    // API
    setCustomData,
    setLayout,
    getBBox,
    setBBox,
    ownedByOther,
    createChildRepr,
  };
};

export type ScenegraphContextType = {
  scenegraph: Scenegraph;
  createNode: (id: Id, parentId: Id | null) => void;
  deleteNode: (
    error: (error: BluefishError) => void,
    id: Id,
    setScope: SetStoreFunction<Scope>
  ) => void;
  createRef: (id: Id, refId: Id, parentId: Id) => void;
  deleteRef: (error: (error: BluefishError) => void, id: Id) => void;
  resolveRef: (
    id: Id,
    mode: "read" | "write" | "check"
  ) => { id: Id; transform: Transform };
  mergeBBoxAndTransform: (
    owner: Id,
    id: Id,
    bbox: BBox,
    transform: Transform
  ) => void;
  setCustomData: (id: Id, customData: any) => void;
  setLayout: (id: Id, layout: LayoutFn) => void;
  getBBox: (id: Id) => BBox;
  setBBox: (owner: Id, id: Id, bbox: BBox) => void;
  ownedByOther: (id: Id, check: Id, dim: Dim) => boolean;
  createChildRepr: (owner: Id, childId: Id) => ChildNode;
};

export const ScenegraphContext = createContext<ScenegraphContextType | null>(
  null
);

export const useScenegraph = () => {
  const context = useContext(ScenegraphContext);

  if (context === null) {
    throw new Error("useScenegraph must be used within a ScenegraphProvider");
  }

  const { getBBox, setBBox, ownedByOther } = context;
  return { getBBox, setBBox, ownedByOther };
};

export const UNSAFE_useScenegraph = () => {
  const context = useContext(ScenegraphContext);

  if (context === null) {
    throw new Error("useScenegraph must be used within a ScenegraphProvider");
  }

  return context;
};

export const ParentIDContext = createContext<Id | null>(null);

export type LayoutFn = (childNodes: ChildNode[]) => {
  bbox: Partial<BBox>;
  transform: Transform;
  customData?: any;
};
