import type { NextRequest } from 'next/server'
import { useRouter } from 'next/router'

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import wasm from './maze-c.wasm?module'

const ID_PREFIX: string = "c";

const IMAGE_SIZE: Point = { x: 300, y: 300 };
const MAZE_SIZE: Point = { x: 127, y: 127 };

const CELL_SIZE: Point = { x: 100, y: 100 };
const PADDING: Point = { x: 12, y: 12 };
const MARGIN: Point = { x: 0, y: 0 };

const WALL_COLOR: string = "#000000";
const WALK_COLOR: string = "#0000ff";
const SOLUTION_COLOR: string = "#ff0000";
const BACKGROUND_COLOR: string = "#ffffff";

const ANIMATION_DELAY: number = 0.0035;

interface Point {
    x: number,
    y: number
}

enum Type {
    Passage,
    Wall,
    Unvisited,
    Solution
}

export const config = {
  runtime: 'experimental-edge',
}

function renderStart(): string {
    const total: Point = {
        x: MARGIN.x * 2 + CELL_SIZE.x * MAZE_SIZE.x,
        y: MARGIN.y * 2 + CELL_SIZE.y * MAZE_SIZE.y
    };

    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n` +
        `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n` +
        `<svg width="${IMAGE_SIZE.x}" height="${IMAGE_SIZE.y}" viewBox="0 0 ${total.x} ${total.y}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">\n` +
        `<rect x="0" y="0" width="${total.x}" height="${total.y}" fill="${BACKGROUND_COLOR}" />`;
}

function renderMazeCell(x: number, y: number, cellType: Type): string {
    switch (cellType) {
        case Type.Passage:
            return `<rect id="${ID_PREFIX}${x}_${y}" x="${MARGIN.x + (CELL_SIZE.x * x) + PADDING.x}" y="${MARGIN.y + (CELL_SIZE.y * y) + PADDING.y}" width="${CELL_SIZE.x - (PADDING.x * 2)}" height="${CELL_SIZE.y - (PADDING.y * 2)}" fill="${BACKGROUND_COLOR}" />`;

        case Type.Wall:
            return `<rect x="${MARGIN.x + (CELL_SIZE.x * x)}" y="${MARGIN.y + (CELL_SIZE.y * y)}" width="${CELL_SIZE.x}" height="${CELL_SIZE.y}" fill="${WALL_COLOR}" />`;

        case Type.Solution:
            return `<rect id="${ID_PREFIX}${x}_${y}" x="${MARGIN.x + (CELL_SIZE.x * x) + PADDING.x}" y="${MARGIN.y + (CELL_SIZE.y * y) + PADDING.y}" width="${CELL_SIZE.x - (PADDING.x * 2)}" height="${CELL_SIZE.y - (PADDING.y * 2)}" fill="${SOLUTION_COLOR}" />`;
    }

    throw new Error("unknown maze tile type");
}

function renderEnd() {
    return `</svg>`;
}

export default async function handler(req: NextRequest, event: Event): Promise<Response> {
    const timeStart = new Date().getMilliseconds();

    const { searchParams } = new URL(req.url);
    let seed: number;

    if (searchParams.get("seed")) {
        seed = parseInt(searchParams.get("seed"), 16);
    } else {
        seed = Math.floor(Math.random() * 4294967295);
    }

    const importObject = {
        env: {
            render_maze_cell: (x, y, cellType) => {
                svgMazeAndSolution.push(renderMazeCell(x, y, cellType));
            },
            render_move_in: (x, y) => {
                svgMazeAndSolution.push(`<animate xlink:href="#${ID_PREFIX}${x}_${y}" attributeName="fill" from="${BACKGROUND_COLOR}" to="${WALK_COLOR}" dur="${ANIMATION_DELAY}s" begin="${tick}s" fill="freeze"/>`);
                tick += ANIMATION_DELAY;
            },
            render_move_out: (x, y) => {
                svgMazeAndSolution.push(`<animate xlink:href="#${ID_PREFIX}${x}_${y}" attributeName="fill" from="${WALK_COLOR}" to="${BACKGROUND_COLOR}" dur="${ANIMATION_DELAY}s" begin="${tick}s" fill="freeze"/>`);
                tick += ANIMATION_DELAY;
            },
            render_solution: (x, y) => {
                    svgMazeAndSolution.push(`<animate xlink:href="#${ID_PREFIX}${x}_${y}" attributeName="fill" from="${WALK_COLOR}" to="${SOLUTION_COLOR}" dur="${ANIMATION_DELAY}s" begin="${tick}s" fill="freeze"/>`);
                    tick += ANIMATION_DELAY;
            }
        },
    };

    const { exports } = await WebAssembly.instantiate(wasm, importObject) as any;

    const svgHeader = renderStart();

    let svgMazeAndSolution: string[] = new Array();
    let tick = 0.0;

    exports.generate_and_solve_maze(MAZE_SIZE.x, MAZE_SIZE.y, seed);

    const svgFooter = renderEnd();

    const svg = [ svgHeader, svgMazeAndSolution.join("\n"), svgFooter ].join("\n");

    const timeEnd = new Date().getMilliseconds();
    console.log(`C: ${timeEnd - timeStart}ms`);

    return new Response(svg, {
        headers: {
            "Content-Type": "image/svg+xml"
        }
    });
}
