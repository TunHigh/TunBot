import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";

export default {
    data: new SlashCommandBuilder()
        .setName("weather")
        .setDescription("Xem thông tin thời tiết trực tiếp cho một địa điểm")
        .addStringOption((option) =>
            option
                .setName("city")
                .setDescription("Tên thành phố, vd: 'London' hoặc 'Tokyo'")
                .setRequired(true),
        ),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Weather interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'weather'
            });
            return;
        }

        const city = interaction.options.getString("city");

        const geoResponse = await fetch(
            `${GEOCODING_URL}?name=${encodeURIComponent(city)}`,
        );
        const geoData = await geoResponse.json();

        if (!geoData.results || geoData.results.length === 0) {
            logger.info(`Weather command - city not found`, {
                userId: interaction.user.id,
                city: city,
                guildId: interaction.guildId
            });
            await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `Không tìm thấy địa điểm nào cho **${city}**. Vui lòng kiểm tra lại chính tả.` });
            return;
        }

        const { latitude, longitude, name, country } = geoData.results[0];
        const cityDisplay = name;

        const weatherResponse = await fetch(
            `${WEATHER_URL}?latitude=${latitude}&longitude=${longitude}&current_weather=true`,
        );
        const weatherData = await weatherResponse.json();

        if (weatherData.error) {
            logger.error(`Weather API error`, {
                error: weatherData.reason,
                city: city,
                userId: interaction.user.id,
                guildId: interaction.guildId
            });
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Đã xảy ra lỗi từ dịch vụ thời tiết.' });
            return;
        }

        const current = weatherData.current || weatherData.current_weather || {};
        const temperature = current.temperature != null ? Math.round(current.temperature) : "N/A";
        const humidity = current.relativehumidity ?? current.relative_humidity_2m ?? "N/A";
        const windSpeed = current.windspeed != null ? Math.round(current.windspeed) : "N/A";
        const weatherCode = current.weathercode ?? current.weather_code ?? null;

        const condition = getWeatherDescription(weatherCode);

        const embed = createEmbed({ title: `Thời Tiết Ở ${cityDisplay}, ${country}`, description: condition.description })
            .addFields(
                {
                    name: "Nhiệt Độ",
                    value: `${temperature}°C`,
                    inline: true,
                },
                {
                    name: "Độ Ẩm",
                    value: `${humidity}%`,
                    inline: true,
                },
                {
                    name: "Tốc Độ Gió",
                    value: `${windSpeed} km/h`,
                    inline: true,
                },
            )
            .setFooter({
                text: `Vĩ độ: ${latitude.toFixed(2)} | Kinh độ: ${longitude.toFixed(2)}`,
            });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        logger.info(`Weather command executed`, {
            userId: interaction.user.id,
            city: cityDisplay,
            country: country,
            temperature: temperature,
            guildId: interaction.guildId
        });
    },
};

function getWeatherDescription(code) {
    if (code >= 0 && code <= 3) {
        return { description: "Trời quang / Có mây rải rác", emoji: "" };
    } else if (code >= 45 && code <= 48) {
        return { description: "Sương mù", emoji: "" };
    } else if (code >= 51 && code <= 67) {
        return { description: "Mưa phùn hoặc mưa", emoji: "" };
    } else if (code >= 71 && code <= 75) {
        return { description: "Tuyết rơi", emoji: "" };
    } else if (code >= 80 && code <= 86) {
        return { description: "Mưa rào (Mưa/Tuyết)", emoji: "" };
    } else if (code >= 95 && code <= 99) {
        return { description: "Giông bão", emoji: "" };
    }
    return { description: "Thời tiết không xác định.", emoji: "" };
}