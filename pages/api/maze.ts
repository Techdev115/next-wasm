import type { NextRequest } from 'next/server'
import { useRouter } from 'next/router'

const cellSize: Point = { x: 100, y: 100 };
const padding: Point = { x: 12, y: 12 };
const margin: Point = { x: 0, y: 0 };

const WIDTH: number = 127;
const HEIGHT: number = 127;

const WALL_COLOR: string = "#000000";
const WALK_COLOR: string = "#0000ff";
const SOLUTION_COLOR: string = "#ff0000";
const BACKGROUND_COLOR: string = "#ffffff";

const ANIMATION_DELAY: number = 0.0035;

interface Point {
    x: number,
    y: number
}

interface Animation {
    tick: number,
    svg: string[]
}

enum Type {
    Passage,
    Wall,
    Unvisited,
    Solution
}

class Direction {
    static readonly North = { x: 0,  y: -1 };
    static readonly East  = { x: -1, y: 0  };
    static readonly South = { x:  0, y: 1  };
    static readonly West  = { x:  1, y: 0  };
}

export const config = {
  runtime: 'experimental-edge',
}

let randomState: number[] = [ 0, 0, 0, 0 ];

function rotl(x: number, k: number) {
    return ((x << k) | (x >>> (32 - k))) >>> 0;
}

function splitmix32(n: number): [ number, number ] {
    let z = n = ((n >>> 0) + 0x9e3779b9) >>> 0;
    z = Math.imul((z ^ (z >>> 16)) >>> 0, 0x85ebca6b) >>> 0;
    z = Math.imul((z ^ (z >>> 13)) >>> 0, 0xc2b2ae35) >>> 0;
    return [ n, (z ^ (z >>> 16)) >>> 0 ];
}
 
 function randSeed(seed: number) {
    let mixer: number = seed;

    // Populate the random state based on the seed using splitmix32
    [ mixer, randomState[0] ] = splitmix32(mixer);
    [ mixer, randomState[1] ] = splitmix32(mixer);
    [ mixer, randomState[2] ] = splitmix32(mixer);
    [ mixer, randomState[3] ] = splitmix32(mixer);
}

function randNext(): number {
    // This is xoshiro128**, a 32-bit PRNG by David Blackman and
    // Sebastiano Vigna. We use this for consistency of generation
    // across implementations.
    let result: number = Math.imul(rotl(Math.imul(randomState[1], 5) >>> 0, 7), 9) >>> 0;
    const t: number = randomState[1] << 9;

    randomState[2] ^= randomState[0];
    randomState[3] ^= randomState[1];
    randomState[1] ^= randomState[2];
    randomState[0] ^= randomState[3];

    randomState[2] ^= t;

    randomState[3] = rotl(randomState[3], 11);

    result = result >>> 0;

    return result;
}

function randomizeDirections(directions: Direction[])
{
    for (let i = directions.length - 1; i > 0; i--) {
        const j = randNext() % (i + 1);
        [ directions[i], directions[j] ] = [ directions[j], directions[i] ]
    }
}

function generateMaze(): [ Type[][], Point, Point ]
{
    let maze: Type[][] = [ ];
    let unvisited = Math.floor(WIDTH / 2) * Math.floor(HEIGHT / 2);

    for (let y = 0; y < HEIGHT; y++) {
        maze[y] = new Array();

        for (let x = 0; x < WIDTH; x++) {
            maze[y][x] = Type.Wall;
        }
    }

    // set up the start and end nodes 
    let start: Point = {
        x: 1 + (randNext() % Math.floor(WIDTH / 2)) * 2,
        y: 0
    };
    maze[start.y][start.x] = Type.Passage;

    let end: Point = {
        x: 1 + (randNext() % Math.floor(WIDTH / 2)) * 2,
        y: HEIGHT - 1
    };
    maze[end.y][end.x] = Type.Passage;

    // set up the walk with unvisited passages
    for (let x = 1; x < WIDTH; x += 2) {
        for (let y = 1; y < HEIGHT; y += 2) {
            maze[y][x] = Type.Unvisited;
        }
    }

    // select a random unvisited passage to start
    let p: Point = {
        x: 1 + (randNext() % Math.floor(WIDTH / 2)) * 2,
        y: 1 + (randNext() % Math.floor(HEIGHT / 2)) * 2
    };

    maze[p.y][p.x] = Type.Passage;
    unvisited--;

    // Aldous-Broder algorithm: walk through the maze in random
    // directions, removing the wall to the neighbor if we haven't
    // yet seen it
    while (unvisited > 0) {
        let directions: Point[] = [
            Direction.North,
            Direction.East,
            Direction.South,
            Direction.West
        ];

        randomizeDirections(directions);

        for (let i = 0; i < directions.length; i++) {
            let wall: Point = {
                x: p.x + directions[i].x,
                y: p.y + directions[i].y
            };
            let neighbor: Point = {
                x: p.x + (directions[i].x * 2),
                y: p.y + (directions[i].y * 2)
            };

            // stop if we're walking outside the bounds of the maze
            if (wall.x < 1 || wall.x > (WIDTH - 2) ||
                wall.y < 1 || wall.y > (HEIGHT - 2)) {
                continue;
            }

            // remove the wall, mark the neighbor as seen
            if (maze[neighbor.y][neighbor.x] == Type.Unvisited) {
                maze[neighbor.y][neighbor.x] = Type.Passage;
                maze[wall.y][wall.x] = Type.Passage;
                unvisited--;
            }

            p.x = neighbor.x;
            p.y = neighbor.y;
            break;
        }
    }

    return [ maze, start, end ];
}



function animateMoveIn(x: number, y: number, animation: Animation) {
    animation.svg.push(`<animate xlink:href="#${x}_${y}" attributeName="fill" from="${BACKGROUND_COLOR}" to="${WALK_COLOR}" dur="${ANIMATION_DELAY}s" begin="${animation.tick}s" fill="freeze"/>`);
    animation.tick += ANIMATION_DELAY;
}

function animateMoveOut(x: number, y: number, animation: Animation) {
    animation.svg.push(`<animate xlink:href="#${x}_${y}" attributeName="fill" from="${WALK_COLOR}" to="${BACKGROUND_COLOR}" dur="${ANIMATION_DELAY}s" begin="${animation.tick}s" fill="freeze"/>`);
    animation.tick += ANIMATION_DELAY;
}

function animateSolution(x: number, y: number, animation: Animation) {
    animation.svg.push(`<animate xlink:href="#${x}_${y}" attributeName="fill" from="${WALK_COLOR}" to="${SOLUTION_COLOR}" dur="${ANIMATION_DELAY}s" begin="${animation.tick}s" fill="freeze"/>`);
    animation.tick += ANIMATION_DELAY;
}

function pointsEqual(a: Point | undefined, b: Point | undefined) {
    return (a && b && a.x == b.x && a.y == b.y);
}

function solveRecursive(maze: Type[][], current: Point, previous: Point | undefined, end: Point, animation: Animation): boolean {
    if (maze[current.y][current.x] == Type.Wall) {
        return false;
    }

    animateMoveIn(current.x, current.y, animation);

    if (current.x == end.x && current.y == end.y) {
        maze[current.y][current.x] = Type.Solution;
        animateSolution(current.x, current.y, animation);
        return true;
    }

    if (current.y > 0) {
        const north: Point = { x: current.x, y: current.y - 1 };

        if (!pointsEqual(north, previous) &&
            solveRecursive(maze, north, current, end, animation)) {
            maze[current.y][current.x] = Type.Solution;
            animateSolution(current.x, current.y, animation);
            return true;
        }
    }

    if (current.x > 0) {
        const east: Point = { x: current.x - 1, y: current.y };

        if (!pointsEqual(east, previous) &&
            solveRecursive(maze, east, current, end, animation)) {
            maze[current.y][current.x] = Type.Solution;
            animateSolution(current.x, current.y, animation);
            return true;
        }
    }

    if (current.y < (HEIGHT - 1)) {
        const south: Point = { x: current.x, y: current.y + 1 };

        if (!pointsEqual(south, previous) &&
            solveRecursive(maze, south, current, end, animation)) {
            maze[current.y][current.x] = Type.Solution;
            animateSolution(current.x, current.y, animation);
            return true;
        }
    }

    if (current.x < (WIDTH - 1)) {
        const west: Point = { x: current.x + 1, y: current.y };

        if (!pointsEqual(west, previous) &&
            solveRecursive(maze, west, current, end, animation)) {
            maze[current.y][current.x] = Type.Solution;
            animateSolution(current.x, current.y, animation);
            return true;
        }
    }

    animateMoveOut(current.x, current.y, animation);

    return false;
}

function solve(maze: Type[][], start: Point, end: Point) {
    let animation = { tick: 0.0, svg: new Array() };

    solveRecursive(maze, start, undefined, end, animation);

    return animation.svg.join("\n");
}

function svgStart(maze: Type[][]): string
{
    const total: Point = {
        x: margin.x * 2 + cellSize.x * WIDTH,
        y: margin.y * 2 + cellSize.y * HEIGHT
    };
    let svg: string = "";

    svg += `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n`;
    svg += `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n`;
    svg += `<svg width="${total.x / 30}" height="${total.y / 30}" viewBox="0 0 ${total.x} ${total.y}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">\n`;
    svg += `<rect x="0" y="0" width="${total.x}" height="${total.y}" fill="${BACKGROUND_COLOR}" />\n`;

    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            switch (maze[y][x]) {
                case Type.Passage:
                    svg += `<rect id="${x}_${y}" x="${margin.x + (cellSize.x * x) + padding.x}" y="${margin.y + (cellSize.y * y) + padding.y}" width="${cellSize.x - (padding.x * 2)}" height="${cellSize.y - (padding.y * 2)}" fill="${BACKGROUND_COLOR}" />\n`;
                    break;

                case Type.Wall:
                    svg += `<rect x="${margin.x + (cellSize.x * x)}" y="${margin.y + (cellSize.y * y)}" width="${cellSize.x}" height="${cellSize.y}" fill="${WALL_COLOR}" />\n`;
                    break;

                case Type.Solution:
                    svg += `<rect id="${x}_${y}" x="${margin.x + (cellSize.x * x) + padding.x}" y="${margin.y + (cellSize.y * y) + padding.y}" width="${cellSize.x - (padding.x * 2)}" height="${cellSize.y - (padding.y * 2)}" fill="${SOLUTION_COLOR}" />\n`;
                    break;

                default:
                    throw new Error("unknown maze tile type");
            }
        }
    }

    return svg;
}

function svgEnd() {
    return `</svg>`;
}

export default function handler(req: NextRequest, event: Event): Response {
    const { searchParams } = new URL(req.url);
    const seed = searchParams.get('seed');

    if (seed) {
        randSeed(parseInt(seed, 16));
    } else {
        randSeed(Math.floor(Math.random() * 4294967295));
    }

    let [ maze, start, end ] = generateMaze();

    const svgHeader = svgStart(maze);
    const svgSolution = solve(maze, start, end);
    const svgFooter = svgEnd();

    const svg = svgHeader + svgSolution + svgFooter;

    return new Response(svg, {
        headers: {
            "Content-Type": "image/svg+xml"
        }
    });
}
