using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.ServiceProcess;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using LibreHardwareMonitor.Hardware;

namespace EasyDesk.SensorService
{
    internal static class Program
    {
        private static void Main()
        {
            ServiceBase.Run(new SensorService());
        }
    }

    internal sealed class SensorService : ServiceBase
    {
        private const int Port = 47621;
        private static readonly TimeSpan IdleTimeout = TimeSpan.FromSeconds(30);
        private readonly object _computerLock = new object();
        private Computer _computer;
        private TcpListener _listener;
        private CancellationTokenSource _cancellation;
        private DateTime _lastRequest = DateTime.UtcNow;

        public SensorService()
        {
            ServiceName = "EasyDeskSensorService";
            CanStop = true;
            AutoLog = true;
        }

        protected override void OnStart(string[] args)
        {
            _computer = new Computer
            {
                IsCpuEnabled = true,
                IsGpuEnabled = true,
                IsStorageEnabled = true,
                IsMotherboardEnabled = true,
                IsPowerMonitorEnabled = true
            };
            _computer.Open();

            _cancellation = new CancellationTokenSource();
            _listener = new TcpListener(IPAddress.Loopback, Port);
            _listener.Start();
            _lastRequest = DateTime.UtcNow;
            _ = Task.Run(() => AcceptRequests(_cancellation.Token));
            _ = Task.Run(() => StopWhenIdle(_cancellation.Token));
        }

        protected override void OnStop()
        {
            _cancellation?.Cancel();
            _listener?.Stop();
            lock (_computerLock)
            {
                _computer?.Close();
                _computer = null;
            }
            _cancellation?.Dispose();
        }

        private async Task AcceptRequests(CancellationToken cancellationToken)
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                TcpClient client;
                try
                {
                    client = await _listener.AcceptTcpClientAsync();
                }
                catch (ObjectDisposedException) when (cancellationToken.IsCancellationRequested)
                {
                    return;
                }
                catch (SocketException) when (cancellationToken.IsCancellationRequested)
                {
                    return;
                }

                _ = Task.Run(() => HandleRequest(client));
            }
        }

        private void HandleRequest(TcpClient client)
        {
            using (client)
            {
                try
                {
                    client.ReceiveTimeout = 3000;
                    client.SendTimeout = 3000;
                    using (var stream = client.GetStream())
                    using (var reader = new StreamReader(stream, Encoding.ASCII, false, 1024, true))
                    {
                        var requestLine = reader.ReadLine();
                        string header;
                        while (!string.IsNullOrEmpty(header = reader.ReadLine()))
                        {
                        }

                        if (requestLine == null || !requestLine.StartsWith("GET /sensors ", StringComparison.Ordinal))
                        {
                            WriteResponse(stream, 404, "Not Found", "{\"error\":\"Not found\"}");
                            return;
                        }

                        _lastRequest = DateTime.UtcNow;
                        WriteResponse(stream, 200, "OK", new JavaScriptSerializer().Serialize(ReadSensors()));
                    }
                }
                catch (Exception error)
                {
                    WriteResponse(client, 500, "Internal Server Error",
                        new JavaScriptSerializer().Serialize(new { error = error.Message }));
                }
            }
        }

        private object ReadSensors()
        {
            lock (_computerLock)
            {
                _computer.Accept(new UpdateVisitor());
                var readings = EnumerateSensors(_computer.Hardware).ToList();

                return new
                {
                    available = true,
                    cpuTemperatureCelsius = HighestValue(readings, HardwareType.Cpu, SensorType.Temperature),
                    gpuTemperatureCelsius = HighestValue(readings, IsGpu, SensorType.Temperature),
                    diskTemperatureCelsius = HighestValue(readings, HardwareType.Storage, SensorType.Temperature),
                    cpuPowerWatts = PreferredPower(readings, HardwareType.Cpu, "package", "total", "socket"),
                    gpuPowerWatts = PreferredPower(readings, IsGpu, "board", "total", "package"),
                    systemPowerWatts = PreferredPower(readings, HardwareType.PowerMonitor, "total", "output"),
                    powerSupplyEfficiencyPercent = PowerSupplyEfficiency(readings)
                };
            }
        }

        private static IEnumerable<SensorReading> EnumerateSensors(IEnumerable<IHardware> hardwareItems)
        {
            foreach (var hardware in hardwareItems)
            {
                foreach (var sensor in hardware.Sensors)
                {
                    if (sensor.Value.HasValue)
                    {
                        yield return new SensorReading(hardware.HardwareType, sensor.SensorType, sensor.Name, sensor.Value.Value);
                    }
                }

                foreach (var reading in EnumerateSensors(hardware.SubHardware))
                {
                    yield return reading;
                }
            }
        }

        private static double? HighestValue(
            IEnumerable<SensorReading> readings,
            HardwareType hardwareType,
            SensorType sensorType)
        {
            var values = readings
                .Where(reading => reading.HardwareType == hardwareType && reading.SensorType == sensorType)
                .Select(reading => (double)reading.Value)
                .ToArray();
            return values.Length == 0 ? (double?)null : values.Max();
        }

        private static double? HighestValue(
            IEnumerable<SensorReading> readings,
            Func<HardwareType, bool> hardwareFilter,
            SensorType sensorType)
        {
            var values = readings
                .Where(reading => hardwareFilter(reading.HardwareType) && reading.SensorType == sensorType)
                .Select(reading => (double)reading.Value)
                .ToArray();
            return values.Length == 0 ? (double?)null : values.Max();
        }

        private static double? PreferredPower(
            IEnumerable<SensorReading> readings,
            HardwareType hardwareType,
            params string[] preferredNames)
        {
            return PreferredPower(readings, type => type == hardwareType, preferredNames);
        }

        private static double? PreferredPower(
            IEnumerable<SensorReading> readings,
            Func<HardwareType, bool> hardwareFilter,
            params string[] preferredNames)
        {
            var candidates = readings
                .Where(reading => hardwareFilter(reading.HardwareType) && reading.SensorType == SensorType.Power)
                .ToArray();
            if (candidates.Length == 0)
            {
                return null;
            }

            var selected = candidates
                .OrderByDescending(reading => NameScore(reading.Name, preferredNames))
                .First();
            return selected.Value;
        }

        private static double? PowerSupplyEfficiency(IEnumerable<SensorReading> readings)
        {
            var efficiency = readings.FirstOrDefault(reading =>
                reading.HardwareType == HardwareType.PowerMonitor &&
                reading.SensorType == SensorType.Factor &&
                reading.Name.IndexOf("efficiency", StringComparison.OrdinalIgnoreCase) >= 0);

            if (efficiency == null)
            {
                return null;
            }

            var value = (double)efficiency.Value;
            return value <= 1 ? value * 100 : value;
        }

        private static int NameScore(string name, IEnumerable<string> preferredNames)
        {
            for (var index = 0; index < preferredNames.Count(); index++)
            {
                if (name.IndexOf(preferredNames.ElementAt(index), StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    return preferredNames.Count() - index;
                }
            }

            return 0;
        }

        private static bool IsGpu(HardwareType hardwareType)
        {
            return hardwareType == HardwareType.GpuNvidia ||
                hardwareType == HardwareType.GpuAmd ||
                hardwareType == HardwareType.GpuIntel;
        }

        private async Task StopWhenIdle(CancellationToken cancellationToken)
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    await Task.Delay(TimeSpan.FromSeconds(5), cancellationToken);
                }
                catch (OperationCanceledException)
                {
                    return;
                }

                if (DateTime.UtcNow - _lastRequest < IdleTimeout)
                {
                    continue;
                }

                Stop();
                return;
            }
        }

        private static void WriteResponse(TcpClient client, int status, string reason, string body)
        {
            if (client == null || !client.Connected)
            {
                return;
            }

            try
            {
                WriteResponse(client.GetStream(), status, reason, body);
            }
            catch (ObjectDisposedException)
            {
            }
            catch (IOException)
            {
            }
            catch (SocketException)
            {
            }
        }

        private static void WriteResponse(NetworkStream stream, int status, string reason, string body)
        {
            var payload = Encoding.UTF8.GetBytes(body);
            var header = Encoding.ASCII.GetBytes(
                "HTTP/1.1 " + status + " " + reason + "\r\n" +
                "Content-Type: application/json; charset=utf-8\r\n" +
                "Content-Length: " + payload.Length + "\r\n" +
                "Connection: close\r\n\r\n");
            stream.Write(header, 0, header.Length);
            stream.Write(payload, 0, payload.Length);
        }

        private sealed class SensorReading
        {
            public SensorReading(HardwareType hardwareType, SensorType sensorType, string name, float value)
            {
                HardwareType = hardwareType;
                SensorType = sensorType;
                Name = name ?? string.Empty;
                Value = value;
            }

            public HardwareType HardwareType { get; }
            public SensorType SensorType { get; }
            public string Name { get; }
            public float Value { get; }
        }

        private sealed class UpdateVisitor : IVisitor
        {
            public void VisitComputer(IComputer computer)
            {
                computer.Traverse(this);
            }

            public void VisitHardware(IHardware hardware)
            {
                hardware.Update();
                foreach (var subHardware in hardware.SubHardware)
                {
                    subHardware.Accept(this);
                }
            }

            public void VisitSensor(ISensor sensor)
            {
            }

            public void VisitParameter(IParameter parameter)
            {
            }
        }
    }
}
