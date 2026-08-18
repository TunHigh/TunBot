import { createCanvas } from '@napi-rs/canvas';
import sharp from 'sharp';

// ============================================================
// DICE ANIMATED WEBP - 3 DICE (TÀI XỈU STYLE)
// @napi-rs/canvas + sharp
//
// Output:
//     renderRollAnimation([dice1, dice2, dice3]) -> Buffer (WebP)
//     renderFinalFrame([dice1, dice2, dice3]) -> Buffer (PNG)
//
// Transparent background
// ============================================================

const SIZE = 240;           // Single die size
const CANVAS_WIDTH = 800;   // 3 dice + gaps
const CANVAS_HEIGHT = 320;
const FPS = 30;
const FRAME_COUNT = 45;     // Reduced to fit WebP 16383px height limit (320*45=14400)
const FRAME_DELAY = Math.round(1000 / FPS);
const DICE_GAP = 30;

// ============================================================
// STYLE
// ============================================================

const STYLE = {
    cubeSize: 72,

    // Main faces
    front: '#F8F8F5',
    right: '#E7E9E7',
    top: '#FFFFFF',

    left: '#E1E4E3',
    bottom: '#D8DBDA',
    back: '#D2D6D5',

    // Outline
    outline: '#999E9F',

    // Pips
    pip: '#777C7D',
    pipShadow: 'rgba(60,65,65,0.22)',
    pipHighlight: 'rgba(255,255,255,0.55)',

    // Shadow
    groundShadow: 'rgba(65,70,70,0.18)',

    // Motion
    motion: 'rgba(125,132,132,0.40)',

    // Background
    background: '#111318',
    titleColor: 'rgba(255,255,255,0.9)',
    textColor: 'rgba(255,255,255,0.45)',
    resultTextColor: '#ffffff',
};

// ============================================================
// MATH
// ============================================================

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

function easeInOutSine(t) {
    return -(Math.cos(Math.PI * t) - 1) / 2;
}

function rotatePoint(point, rx, ry, rz) {
    let { x, y, z } = point;

    // X rotation
    const cosX = Math.cos(rx);
    const sinX = Math.sin(rx);

    const y1 = y * cosX - z * sinX;
    const z1 = y * sinX + z * cosX;

    y = y1;
    z = z1;

    // Y rotation
    const cosY = Math.cos(ry);
    const sinY = Math.sin(ry);

    const x1 = x * cosY + z * sinY;
    const z2 = -x * sinY + z * cosY;

    x = x1;
    z = z2;

    // Z rotation
    const cosZ = Math.cos(rz);
    const sinZ = Math.sin(rz);

    const x2 = x * cosZ - y * sinZ;
    const y2 = x * sinZ + y * cosZ;

    return {
        x: x2,
        y: y2,
        z
    };
}

// ============================================================
// CAMERA
// ============================================================

function project(point) {
    const camera = 520;

    const denominator =
        Math.max(
            120,
            camera - point.z
        );

    const scale =
        camera / denominator;

    return {
        x:
            SIZE / 2 +
            point.x * scale,

        y:
            SIZE / 2 +
            point.y * scale,

        z: point.z,

        scale
    };
}

// ============================================================
// ROUNDED FACE
// ============================================================

function roundedPolygon(
    ctx,
    points,
    radius = 10
) {
    if (points.length < 3) {
        return;
    }

    ctx.beginPath();

    for (
        let i = 0;
        i < points.length;
        i++
    ) {
        const previous =
            points[
                (i - 1 + points.length) %
                    points.length
            ];

        const current =
            points[i];

        const next =
            points[
                (i + 1) %
                    points.length
            ];

        const dx1 =
            previous.x -
            current.x;

        const dy1 =
            previous.y -
            current.y;

        const len1 =
            Math.sqrt(
                dx1 * dx1 +
                dy1 * dy1
            );

        const dx2 =
            next.x -
            current.x;

        const dy2 =
            next.y -
            current.y;

        const len2 =
            Math.sqrt(
                dx2 * dx2 +
                dy2 * dy2
            );

        const r =
            Math.min(
                radius,
                len1 * 0.22,
                len2 * 0.22
            );

        const p1 = {
            x:
                current.x +
                (previous.x -
                    current.x) *
                    (r / len1),

            y:
                current.y +
                (previous.y -
                    current.y) *
                    (r / len1)
        };

        const p2 = {
            x:
                current.x +
                (next.x -
                    current.x) *
                    (r / len2),

            y:
                current.y +
                (next.y -
                    current.y) *
                    (r / len2)
        };

        if (i === 0) {
            ctx.moveTo(
                p1.x,
                p1.y
            );
        } else {
            ctx.lineTo(
                p1.x,
                p1.y
            );
        }

        ctx.quadraticCurveTo(
            current.x,
            current.y,
            p2.x,
            p2.y
        );
    }

    ctx.closePath();
}

// ============================================================
// PIP PATTERNS
// ============================================================

function getPipPattern(number) {
    const d = 0.27;

    const patterns = {
        1: [
            [0, 0]
        ],

        2: [
            [-d, -d],
            [d, d]
        ],

        3: [
            [-d, -d],
            [0, 0],
            [d, d]
        ],

        4: [
            [-d, -d],
            [d, -d],
            [-d, d],
            [d, d]
        ],

        5: [
            [-d, -d],
            [d, -d],
            [0, 0],
            [-d, d],
            [d, d]
        ],

        6: [
            [-d, -d],
            [-d, 0],
            [-d, d],
            [d, -d],
            [d, 0],
            [d, d]
        ]
    };

    return patterns[number] || patterns[1];
}

// ============================================================
// PIP
// ============================================================

function drawPip(
    ctx,
    x,
    y,
    radius,
    alpha = 1
) {
    ctx.save();

    ctx.globalAlpha = alpha;

    // Shadow
    ctx.beginPath();

    ctx.arc(
        x + radius * 0.12,
        y + radius * 0.16,
        radius,
        0,
        Math.PI * 2
    );

    ctx.fillStyle =
        STYLE.pipShadow;

    ctx.fill();

    // Main pip
    ctx.beginPath();

    ctx.arc(
        x,
        y,
        radius,
        0,
        Math.PI * 2
    );

    ctx.fillStyle =
        STYLE.pip;

    ctx.fill();

    // Highlight
    ctx.beginPath();

    ctx.arc(
        x - radius * 0.28,
        y - radius * 0.30,
        radius * 0.25,
        0,
        Math.PI * 2
    );

    ctx.fillStyle =
        STYLE.pipHighlight;

    ctx.fill();

    ctx.restore();
}

// ============================================================
// FACE PIPS
// ============================================================

function drawFacePips(
    ctx,
    face,
    number,
    half,
    rx,
    ry,
    rz
) {
    const pattern =
        getPipPattern(number);

    const distance =
        half * 0.48;

    const radius =
        half * 0.105;

    for (const [px, py] of pattern) {
        let point;

        if (face === 'front') {
            point = {
                x:
                    px * distance,

                y:
                    py * distance,

                z:
                    half + 1
            };
        }

        else if (face === 'right') {
            point = {
                x:
                    half + 1,

                y:
                    py * distance,

                z:
                    px * distance
            };
        }

        else if (face === 'top') {
            point = {
                x:
                    px * distance,

                y:
                    -half - 1,

                z:
                    py * distance
            };
        }

        const rotated =
            rotatePoint(
                point,
                rx,
                ry,
                rz
            );

        const projected =
            project(rotated);

        drawPip(
            ctx,
            projected.x,
            projected.y,
            radius *
                projected.scale
        );
    }
}

// ============================================================
// CUBE FACES
// ============================================================

function getCubeFaces(half) {
    return [
        {
            name: 'front',

            points: [
                {
                    x: -half,
                    y: -half,
                    z: half
                },
                {
                    x: half,
                    y: -half,
                    z: half
                },
                {
                    x: half,
                    y: half,
                    z: half
                },
                {
                    x: -half,
                    y: half,
                    z: half
                }
            ],

            color: STYLE.front
        },

        {
            name: 'right',

            points: [
                {
                    x: half,
                    y: -half,
                    z: -half
                },
                {
                    x: half,
                    y: -half,
                    z: half
                },
                {
                    x: half,
                    y: half,
                    z: half
                },
                {
                    x: half,
                    y: half,
                    z: -half
                }
            ],

            color: STYLE.right
        },

        {
            name: 'top',

            points: [
                {
                    x: -half,
                    y: -half,
                    z: -half
                },
                {
                    x: half,
                    y: -half,
                    z: -half
                },
                {
                    x: half,
                    y: -half,
                    z: half
                },
                {
                    x: -half,
                    y: -half,
                    z: half
                }
            ],

            color: STYLE.top
        },

        {
            name: 'left',

            points: [
                {
                    x: -half,
                    y: -half,
                    z: -half
                },
                {
                    x: -half,
                    y: -half,
                    z: half
                },
                {
                    x: -half,
                    y: half,
                    z: half
                },
                {
                    x: -half,
                    y: half,
                    z: -half
                }
            ],

            color: STYLE.left
        },

        {
            name: 'bottom',

            points: [
                {
                    x: -half,
                    y: half,
                    z: -half
                },
                {
                    x: half,
                    y: half,
                    z: -half
                },
                {
                    x: half,
                    y: half,
                    z: half
                },
                {
                    x: -half,
                    y: half,
                    z: half
                }
            ],

            color: STYLE.bottom
        },

        {
            name: 'back',

            points: [
                {
                    x: -half,
                    y: -half,
                    z: -half
                },
                {
                    x: half,
                    y: -half,
                    z: -half
                },
                {
                    x: half,
                    y: half,
                    z: -half
                },
                {
                    x: -half,
                    y: half,
                    z: -half
                }
            ],

            color: STYLE.back
        }
    ];
}

// ============================================================
// DRAW SINGLE DIE
// ============================================================

function drawDice(
    ctx,
    {
        rx,
        ry,
        rz,
        scale,
        values
    }
) {
    const half =
        STYLE.cubeSize *
        scale;

    const faces =
        getCubeFaces(half);

    const transformed =
        faces.map(face => {
            const rotated =
                face.points.map(point =>
                    rotatePoint(
                        point,
                        rx,
                        ry,
                        rz
                    )
                );

            const projected =
                rotated.map(project);

            const averageZ =
                rotated.reduce(
                    (sum, point) =>
                        sum + point.z,
                    0
                ) / rotated.length;

            return {
                ...face,

                rotated,
                projected,

                averageZ
            };
        });

    // Painter's algorithm
    transformed.sort(
        (a, b) =>
            a.averageZ -
            b.averageZ
    );

    // --------------------------------------------------------
    // Faces
    // --------------------------------------------------------

    for (const face of transformed) {
        roundedPolygon(
            ctx,
            face.projected,
            11
        );

        ctx.fillStyle =
            face.color;

        ctx.fill();

        ctx.strokeStyle =
            STYLE.outline;

        ctx.lineWidth = 2.2;

        ctx.lineJoin =
            'round';

        ctx.stroke();
    }

    // --------------------------------------------------------
    // Soft highlight on front
    // --------------------------------------------------------

    const front =
        transformed.find(
            face =>
                face.name ===
                'front'
        );

    if (front) {
        const p =
            front.projected;

        ctx.save();

        ctx.globalAlpha =
            0.18;

        roundedPolygon(
            ctx,
            [
                {
                    x:
                        p[0].x +
                        (p[1].x -
                            p[0].x) *
                            0.08,

                    y:
                        p[0].y +
                        (p[1].y -
                            p[0].y) *
                            0.08
                },

                {
                    x:
                        p[0].x +
                        (p[1].x -
                            p[0].x) *
                            0.92,

                    y:
                        p[0].y +
                        (p[1].y -
                            p[0].y) *
                            0.08
                },

                {
                    x:
                        p[3].x +
                        (p[2].x -
                            p[3].x) *
                            0.78,

                    y:
                        p[3].y +
                        (p[2].y -
                            p[3].y) *
                            0.20
                },

                {
                    x:
                        p[3].x +
                        (p[2].x -
                            p[3].x) *
                            0.18,

                    y:
                        p[3].y +
                        (p[2].y -
                            p[3].y) *
                            0.20
                }
            ],
            8
        );

        ctx.fillStyle =
            '#FFFFFF';

        ctx.fill();

        ctx.restore();
    }

    // --------------------------------------------------------
    // Pips
    // --------------------------------------------------------

    drawFacePips(
        ctx,
        'front',
        values.front,
        half,
        rx,
        ry,
        rz
    );

    drawFacePips(
        ctx,
        'right',
        values.right,
        half,
        rx,
        ry,
        rz
    );

    drawFacePips(
        ctx,
        'top',
        values.top,
        half,
        rx,
        ry,
        rz
    );
}

// ============================================================
// MOTION LINES
// ============================================================

function drawMotionLines(
    ctx,
    t,
    offsetX
) {
    if (
        t < 0.08 ||
        t > 0.72
    ) {
        return;
    }

    const progress =
        (t - 0.08) /
        0.64;

    const strength =
        Math.sin(
            progress *
                Math.PI
        );

    ctx.save();

    ctx.globalAlpha =
        strength * 0.55;

    ctx.strokeStyle =
        STYLE.motion;

    ctx.lineWidth = 3;

    ctx.lineCap =
        'round';

    const baseX = offsetX + SIZE / 2;

    // Left top
    ctx.beginPath();

    ctx.moveTo(
        baseX - 84,
        98
    );

    ctx.quadraticCurveTo(
        baseX - 120,
        112,
        baseX - 101,
        141
    );

    ctx.stroke();

    // Left bottom
    ctx.beginPath();

    ctx.moveTo(
        baseX - 89,
        191
    );

    ctx.quadraticCurveTo(
        baseX - 122,
        205,
        baseX - 93,
        220
    );

    ctx.stroke();

    // Right top
    ctx.beginPath();

    ctx.moveTo(
        baseX + 84,
        98
    );

    ctx.quadraticCurveTo(
        baseX + 120,
        113,
        baseX + 101,
        142
    );

    ctx.stroke();

    // Right bottom
    ctx.beginPath();

    ctx.moveTo(
        baseX + 89,
        190
    );

    ctx.quadraticCurveTo(
        baseX + 122,
        204,
        baseX + 91,
        220
    );

    ctx.stroke();

    ctx.restore();
}

// ============================================================
// GROUND SHADOW
// ============================================================

function drawGroundShadow(
    ctx,
    t,
    squash,
    offsetX
) {
    let alpha = 0.08;

    if (t > 0.45) {
        alpha =
            0.08 +
            ((t - 0.45) /
                0.55) *
                0.14;
    }

    let width =
        44;

    if (t < 0.75) {
        width +=
            Math.sin(
                t *
                    Math.PI *
                    8
            ) * 8;
    }

    ctx.save();

    ctx.globalAlpha =
        clamp(
            alpha,
            0,
            0.22
        );

    ctx.beginPath();

    ctx.ellipse(
        offsetX + SIZE / 2,
        CANVAS_HEIGHT / 2 + 77,
        width * squash,
        11,
        0,
        0,
        Math.PI * 2
    );

    ctx.fillStyle =
        STYLE.groundShadow;

    ctx.fill();

    ctx.restore();
}

// ============================================================
// DRAW BACKGROUND
// ============================================================

function drawBackground(ctx) {
    ctx.fillStyle = STYLE.background;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Central glow
    const glow = ctx.createRadialGradient(
        CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.47, 20,
        CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.47, CANVAS_WIDTH * 0.5
    );
    glow.addColorStop(0, 'rgba(255,255,255,0.06)');
    glow.addColorStop(0.5, 'rgba(255,255,255,0.02)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Floor glow
    const floor = ctx.createRadialGradient(
        CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.85, 15,
        CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.85, 300
    );
    floor.addColorStop(0, 'rgba(255,255,255,0.03)');
    floor.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = floor;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Title
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px Arial';
    ctx.fillStyle = STYLE.titleColor;
    ctx.fillText('TÀI XỈU', CANVAS_WIDTH / 2, 50);
    const lineWidth = 75;
    const grad = ctx.createLinearGradient(
        CANVAS_WIDTH / 2 - lineWidth, 0,
        CANVAS_WIDTH / 2 + lineWidth, 0
    );
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.3)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(CANVAS_WIDTH / 2 - lineWidth, 64, lineWidth * 2, 1);
    ctx.restore();
}

// ============================================================
// DRAW RESULT TEXT
// ============================================================

function drawRollingText(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '600 17px Arial';
    ctx.fillStyle = STYLE.textColor;
    ctx.fillText('ĐANG LẮC...', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 30);
    ctx.restore();
}

function drawFinalResultText(ctx, diceValues) {
    const total = diceValues[0] + diceValues[1] + diceValues[2];
    const type = total >= 11 ? 'TÀI' : 'XỈU';

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 23px Arial';
    ctx.fillStyle = STYLE.resultTextColor;
    ctx.fillText(
        `${diceValues[0]}  •  ${diceValues[1]}  •  ${diceValues[2]}    =    ${total}    →    ${type}`,
        CANVAS_WIDTH / 2, CANVAS_HEIGHT - 30
    );
    ctx.restore();
}

// ============================================================
// RENDER ONE FRAME FOR 3 DICE
// ============================================================

function renderFrame(
    ctx,
    frame,
    diceResults,
    diceStates
) {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    drawBackground(ctx);

    const t = frame / (FRAME_COUNT - 1);

    // Positions for 3 dice
    const totalWidth = SIZE * 3 + DICE_GAP * 2;
    const startX = (CANVAS_WIDTH - totalWidth) / 2;

    for (let i = 0; i < 3; i++) {
        const state = diceStates[i];
        const offsetX = startX + i * (SIZE + DICE_GAP);

        // --------------------------------------------------------
        // Rotation
        // --------------------------------------------------------

        const spin = easeOutCubic(t);

        let rx = state.initialRx + spin * Math.PI * 7.0;
        let ry = state.initialRy + spin * Math.PI * 10.0;
        let rz = state.initialRz + spin * Math.PI * 3.0;

        // --------------------------------------------------------
        // Landing wobble
        // --------------------------------------------------------

        if (t > 0.68) {
            const landing = (t - 0.68) / 0.32;
            const wobble = Math.sin(landing * Math.PI * 4) * (1 - landing);
            rx += wobble * 0.18;
            ry += wobble * 0.15;
            rz += wobble * 0.07;
        }

        // --------------------------------------------------------
        // Bounce
        // --------------------------------------------------------

        let bounce = 0;
        if (t < 0.80) {
            bounce = Math.sin(t * Math.PI * 5) * (1 - t) * 5;
        }

        // --------------------------------------------------------
        // Squash
        // --------------------------------------------------------

        let squash = 1;
        if (t > 0.70) {
            const landing = (t - 0.70) / 0.30;
            const impact = Math.sin(landing * Math.PI * 3) * (1 - landing);
            squash = 1 + impact * 0.085;
        }

        // --------------------------------------------------------
        // Scale
        // --------------------------------------------------------

        let scale = 1;
        if (t < 0.70) {
            scale = 1 + Math.sin(t * Math.PI * 2) * 0.025;
        }

        // --------------------------------------------------------
        // Shadow
        // --------------------------------------------------------

        drawGroundShadow(ctx, t, squash, offsetX);

        // --------------------------------------------------------
        // Motion
        // --------------------------------------------------------

        drawMotionLines(ctx, t, offsetX);

        // --------------------------------------------------------
        // Dice
        // --------------------------------------------------------

        ctx.save();
        ctx.translate(offsetX, -bounce);

        // --------------------------------------------------------
        // Result transition
        // --------------------------------------------------------

        let resultProgress = 0;
        if (t > 0.58) {
            resultProgress = easeInOutSine((t - 0.58) / 0.42);
        }

        const values = {
            front: resultProgress < 0.50 ? state.startValues.front : diceResults[i],
            right: resultProgress < 0.50 ? state.startValues.right : (diceResults[i] === 6 ? 3 : 6),
            top: resultProgress < 0.50 ? state.startValues.top : (diceResults[i] === 1 ? 6 : 1)
        };

        drawDice(ctx, {
            rx,
            ry,
            rz,
            scale: scale * squash,
            values
        });

        ctx.restore();
    }

    // Text
    if (t < 0.95) {
        drawRollingText(ctx);
    } else {
        drawFinalResultText(ctx, diceResults);
    }
}

// ============================================================
// CREATE ANIMATED WEBP
// ============================================================

export async function renderRollAnimation(diceResults) {
    // Validate
    if (!Array.isArray(diceResults) || diceResults.length !== 3) {
        throw new TypeError('result phải là [dice1, dice2, dice3]');
    }
    for (const v of diceResults) {
        if (!Number.isInteger(v) || v < 1 || v > 6) {
            throw new RangeError('Giá trị xúc xắc phải từ 1 đến 6.');
        }
    }

    const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const ctx = canvas.getContext('2d');

    // Per-dice random initial state
    const diceStates = [0, 1, 2].map(i => {
        return {
            initialRx: (Math.random() - 0.5) * 0.5,
            initialRy: (Math.random() - 0.5) * 0.5,
            initialRz: (Math.random() - 0.5) * 0.5,
            startValues: {
                front: Math.floor(Math.random() * 6) + 1,
                right: Math.floor(Math.random() * 6) + 1,
                top: Math.floor(Math.random() * 6) + 1
            }
        };
    });

    const frameSize = CANVAS_WIDTH * CANVAS_HEIGHT * 4;
    const allFrames = Buffer.allocUnsafe(frameSize * FRAME_COUNT);

    for (let frame = 0; frame < FRAME_COUNT; frame++) {
        renderFrame(ctx, frame, diceResults, diceStates);

        const imageData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        const frameOffset = frame * frameSize;
        Buffer.from(imageData.data).copy(allFrames, frameOffset);
    }

    // Encode animated WebP
    const webp = await sharp(allFrames, {
        raw: {
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT * FRAME_COUNT,
            channels: 4
        }
    })
        .webp({
            quality: 90,
            alphaQuality: 100,
            lossless: false,
            loop: 0,
            delay: FRAME_DELAY
        })
        .toBuffer();

    return webp;
}

// ============================================================
// CREATE FINAL FRAME (PNG)
// ============================================================

export async function renderFinalFrame(diceResults) {
    if (!Array.isArray(diceResults) || diceResults.length !== 3) {
        throw new TypeError('result phải là [dice1, dice2, dice3]');
    }
    for (const v of diceResults) {
        if (!Number.isInteger(v) || v < 1 || v > 6) {
            throw new RangeError('Giá trị xúc xắc phải từ 1 đến 6.');
        }
    }

    const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const ctx = canvas.getContext('2d');

    drawBackground(ctx);

    // Final settled states
    const finalStates = [0, 1, 2].map(i => ({
        initialRx: Math.sin(i * 1.7) * 0.04,
        initialRy: Math.sin(i * 2.3) * 0.06,
        initialRz: Math.sin(i) * 0.025,
        startValues: {
            front: diceResults[i],
            right: diceResults[i] === 6 ? 3 : 6,
            top: diceResults[i] === 1 ? 6 : 1
        }
    }));

    const totalWidth = SIZE * 3 + DICE_GAP * 2;
    const startX = (CANVAS_WIDTH - totalWidth) / 2;

    for (let i = 0; i < 3; i++) {
        const state = finalStates[i];
        const offsetX = startX + i * (SIZE + DICE_GAP);

        ctx.save();
        ctx.translate(offsetX, 0);

        drawDice(ctx, {
            rx: state.initialRx,
            ry: state.initialRy,
            rz: state.initialRz,
            scale: 1,
            values: state.startValues
        });

        ctx.restore();
    }

    drawFinalResultText(ctx, diceResults);

    return canvas.toBuffer('image/png');
}