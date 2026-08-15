import {
    createCanvas,
    loadImage,
} from '@napi-rs/canvas';


// ============================================================
// SIZE
// ============================================================

const WIDTH = 1200;

const HEIGHT = 760;


// ============================================================
// HELPERS
// ============================================================

function roundRect(
    ctx,
    x,
    y,
    width,
    height,
    radius
) {

    radius =
        Math.min(
            radius,
            width / 2,
            height / 2
        );


    ctx.beginPath();

    ctx.moveTo(
        x + radius,
        y
    );

    ctx.arcTo(
        x + width,
        y,
        x + width,
        y + height,
        radius
    );

    ctx.arcTo(
        x + width,
        y + height,
        x,
        y + height,
        radius
    );

    ctx.arcTo(
        x,
        y + height,
        x,
        y,
        radius
    );

    ctx.arcTo(
        x,
        y,
        x + width,
        y,
        radius
    );

    ctx.closePath();
}


// ============================================================
// BACKGROUND
// ============================================================

function drawBackground(
    ctx
) {

    const gradient =
        ctx.createLinearGradient(
            0,
            0,
            0,
            HEIGHT
        );


    gradient.addColorStop(
        0,
        '#37c8ef'
    );

    gradient.addColorStop(
        0.35,
        '#087bc1'
    );

    gradient.addColorStop(
        0.65,
        '#0752a0'
    );

    gradient.addColorStop(
        1,
        '#40185c'
    );


    ctx.fillStyle =
        gradient;

    ctx.fillRect(
        0,
        0,
        WIDTH,
        HEIGHT
    );


    // Ánh sáng
    ctx.save();

    ctx.globalAlpha =
        0.12;

    ctx.fillStyle =
        '#ffffff';


    for (
        let i = -8;
        i < 15;
        i++
    ) {

        ctx.beginPath();

        ctx.moveTo(
            WIDTH / 2,
            0
        );

        ctx.lineTo(
            WIDTH / 2 +
            i * 120,
            470
        );

        ctx.lineTo(
            WIDTH / 2 +
            i * 120 +
            40,
            470
        );

        ctx.closePath();

        ctx.fill();
    }


    ctx.restore();


    // Đáy
    ctx.fillStyle =
        '#4a1b68';

    ctx.fillRect(
        0,
        500,
        WIDTH,
        HEIGHT - 500
    );


    // Bong bóng
    ctx.strokeStyle =
        'rgba(255,255,255,.45)';

    ctx.lineWidth =
        3;


    const bubbles = [

        [70, 90, 14],

        [110, 140, 7],

        [175, 70, 5],

        [1060, 90, 13],

        [1110, 150, 7],

        [1010, 180, 5],

        [80, 290, 6],

        [1140, 280, 8],

        [930, 120, 4],

        [270, 120, 5],
    ];


    for (
        const [
            x,
            y,
            r
        ]
        of bubbles
    ) {

        ctx.beginPath();

        ctx.arc(
            x,
            y,
            r,
            0,
            Math.PI * 2
        );

        ctx.stroke();
    }


    // Rong biển
    ctx.strokeStyle =
        '#187d55';

    ctx.lineWidth =
        10;

    ctx.lineCap =
        'round';


    for (
        let i = 0;
        i < 15;
        i++
    ) {

        const x =
            i * 85 + 20;


        ctx.beginPath();

        ctx.moveTo(
            x,
            HEIGHT
        );

        ctx.quadraticCurveTo(
            x - 25,
            670,
            x + 10,
            565
        );

        ctx.stroke();
    }
}


// ============================================================
// FISH
// ============================================================

function drawFish(
    ctx,
    x,
    y,
    scale = 1
) {

    ctx.save();

    ctx.translate(
        x,
        y
    );

    ctx.scale(
        scale,
        scale
    );


    ctx.fillStyle =
        '#f4a82e';

    ctx.beginPath();

    ctx.ellipse(
        0,
        0,
        48,
        25,
        0,
        0,
        Math.PI * 2
    );

    ctx.fill();


    ctx.fillStyle =
        '#e8544e';

    ctx.beginPath();

    ctx.moveTo(
        -42,
        0
    );

    ctx.lineTo(
        -80,
        -28
    );

    ctx.lineTo(
        -80,
        28
    );

    ctx.closePath();

    ctx.fill();


    ctx.fillStyle =
        '#ffffff';

    ctx.beginPath();

    ctx.arc(
        30,
        -7,
        7,
        0,
        Math.PI * 2
    );

    ctx.fill();


    ctx.fillStyle =
        '#111';

    ctx.beginPath();

    ctx.arc(
        32,
        -7,
        3,
        0,
        Math.PI * 2
    );

    ctx.fill();


    ctx.restore();
}


// ============================================================
// AVATAR
// ============================================================

async function getAvatar(
    user
) {

    try {

        return await loadImage(
            user.displayAvatarURL({
                extension: 'png',
                size: 256,
            })
        );

    } catch {

        return null;
    }
}


function drawAvatar(
    ctx,
    image,
    x,
    y,
    radius
) {

    ctx.save();


    ctx.beginPath();

    ctx.arc(
        x,
        y,
        radius,
        0,
        Math.PI * 2
    );

    ctx.clip();


    if (image) {

        ctx.drawImage(
            image,
            x - radius,
            y - radius,
            radius * 2,
            radius * 2
        );

    } else {

        ctx.fillStyle =
            '#777';

        ctx.fillRect(
            x - radius,
            y - radius,
            radius * 2,
            radius * 2
        );
    }


    ctx.restore();


    ctx.strokeStyle =
        '#ffffff';

    ctx.lineWidth =
        8;


    ctx.beginPath();

    ctx.arc(
        x,
        y,
        radius,
        0,
        Math.PI * 2
    );

    ctx.stroke();
}


// ============================================================
// PROGRESS BAR
// ============================================================

function drawProgress(
    ctx,
    x,
    y,
    width,
    height,
    progress
) {

    progress =
        Math.max(
            0,
            Math.min(
                1,
                progress
            )
        );


    roundRect(
        ctx,
        x,
        y,
        width,
        height,
        height / 2
    );


    ctx.fillStyle =
        'rgba(0,0,0,.35)';

    ctx.fill();


    const fillWidth =
        width * progress;


    if (
        fillWidth <= 0
    ) {
        return;
    }


    roundRect(
        ctx,
        x,
        y,
        fillWidth,
        height,
        height / 2
    );


    const gradient =
        ctx.createLinearGradient(
            x,
            y,
            x + width,
            y
        );


    gradient.addColorStop(
        0,
        '#ffd84d'
    );

    gradient.addColorStop(
        1,
        '#ff733d'
    );


    ctx.fillStyle =
        gradient;

    ctx.fill();
}


// ============================================================
// TEXT
// ============================================================

function text(
    ctx,
    value,
    x,
    y,
    size,
    align = 'center',
    weight = 'bold'
) {

    ctx.font =
        `${weight} ${size}px sans-serif`;

    ctx.textAlign =
        align;

    ctx.fillStyle =
        '#ffffff';

    ctx.fillText(
        value,
        x,
        y
    );
}


// ============================================================
// MAIN RENDER
// ============================================================

export async function renderStreakCard(
    client,
    streak,
    user1Id,
    user2Id
) {

    const canvas =
        createCanvas(
            WIDTH,
            HEIGHT
        );


    const ctx =
        canvas.getContext(
            '2d'
        );


    // Background
    drawBackground(
        ctx
    );


    // Fish
    drawFish(
        ctx,
        120,
        370,
        0.8
    );

    drawFish(
        ctx,
        1070,
        330,
        0.7
    );


    // ========================================================
    // HEADER
    // ========================================================

    text(
        ctx,
        '🔥 GIỮ LỬA',
        WIDTH / 2,
        68,
        46
    );


    // ========================================================
    // USERS
    // ========================================================

    let user1;

    let user2;


    try {

        user1 =
            await client.users.fetch(
                user1Id
            );

    } catch {}


    try {

        user2 =
            await client.users.fetch(
                user2Id
            );

    } catch {}


    const avatar1 =
        user1
            ? await getAvatar(user1)
            : null;


    const avatar2 =
        user2
            ? await getAvatar(user2)
            : null;


    drawAvatar(
        ctx,
        avatar1,
        360,
        160,
        72
    );


    drawAvatar(
        ctx,
        avatar2,
        840,
        160,
        72
    );


    text(
        ctx,
        user1?.username ||
        'User 1',
        360,
        255,
        28
    );


    text(
        ctx,
        user2?.username ||
        'User 2',
        840,
        255,
        28
    );


    text(
        ctx,
        '🔥',
        600,
        175,
        34
    );


    // ========================================================
    // MESSAGE
    // ========================================================

    text(
        ctx,
        'TIN NHẮN',
        150,
        325,
        21,
        'left'
    );


    text(
        ctx,
        'TIN NHẮN',
        650,
        325,
        21,
        'left'
    );


    text(
        ctx,
        `${streak.user1Messages}/50`,
        150,
        365,
        27,
        'left'
    );


    text(
        ctx,
        `${streak.user2Messages}/50`,
        650,
        365,
        27,
        'left'
    );


    drawProgress(
        ctx,
        150,
        382,
        380,
        22,
        streak.user1Messages / 50
    );


    drawProgress(
        ctx,
        650,
        382,
        380,
        22,
        streak.user2Messages / 50
    );


    // ========================================================
    // REPLY
    // ========================================================

    text(
        ctx,
        '↩ REPLY',
        150,
        440,
        20,
        'left'
    );


    text(
        ctx,
        '↩ REPLY',
        650,
        440,
        20,
        'left'
    );


    text(
        ctx,
        `${streak.user1Replies}/1`,
        150,
        475,
        24,
        'left'
    );


    text(
        ctx,
        `${streak.user2Replies}/1`,
        650,
        475,
        24,
        'left'
    );


    drawProgress(
        ctx,
        150,
        492,
        380,
        16,
        streak.user1Replies
    );


    drawProgress(
        ctx,
        650,
        492,
        380,
        16,
        streak.user2Replies
    );


    // ========================================================
    // STREAK NUMBER
    // ========================================================

    text(
        ctx,
        String(
            streak.streakDays
        ),
        WIDTH / 2,
        610,
        78
    );


    text(
        ctx,
        'NGÀY STREAK',
        WIDTH / 2,
        650,
        26
    );


    // ========================================================
    // MILESTONES
    // ========================================================

    const milestones = [
        1,
        5,
        15,
        30,
        60,
        90,
        120,
        150,
        180,
    ];


    const startX =
        170;

    const gap =
        108;


    for (
        let i = 0;
        i < milestones.length;
        i++
    ) {

        const day =
            milestones[i];


        const x =
            startX +
            i * gap;


        const reached =
            streak.streakDays >=
            day;


        ctx.beginPath();

        ctx.arc(
            x,
            710,
            21,
            0,
            Math.PI * 2
        );


        ctx.fillStyle =
            reached
                ? '#ffd84d'
                : 'rgba(255,255,255,.25)';

        ctx.fill();


        ctx.font =
            'bold 14px sans-serif';

        ctx.textAlign =
            'center';

        ctx.fillStyle =
            reached
                ? '#4a1b68'
                : '#ffffff';


        ctx.fillText(
            String(day),
            x,
            715
        );
    }


    return canvas.toBuffer(
        'image/png'
    );
}